const express = require('express');
const router = express.Router();
const db = require('../service/db');
const { Storage } = require('@google-cloud/storage');
const path = require('path'); 

// ============================================================================
// 🌟 智慧判斷 GCS 連線模式 (本地端 vs 雲端 Cloud Run)
// ============================================================================
let storage;

// K_SERVICE 是 Cloud Run 系統預設一定會自動注入的環境變數
if (process.env.K_SERVICE) {
  // ☁️ 雲端模式：直接呼叫 new Storage()，它會自動抓取 Cloud Run 綁定的服務帳戶權限
  console.log('[GCS] 偵測到 Cloud Run 環境，使用自動內建憑證');
  storage = new Storage();
} else {
  // 💻 本地端模式：使用實體 JSON 金鑰檔
  console.log('[GCS] 偵測到本地環境，使用 JSON 金鑰檔');
  const keyFilePath = path.join(__dirname, '../config/upheld-now-268802-d8afa282b657.json');
  storage = new Storage({ keyFilename: keyFilePath });
}

const BUCKET_NAME = 'youbike-data';

// ============================================================================
// 📸 1. 取得特定檢查單的 GCS 照片 (動態產生 Signed URL)
// ============================================================================
router.get('/photos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const prefix = `inspections/${id}/`; 
    
    const [files] = await bucket.getFiles({ prefix });
    
    if (files.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const imageFiles = files.filter(file => !file.name.endsWith('/'));

    const photoUrls = await Promise.all(imageFiles.map(async file => {
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 5 * 24 * 60 * 60 * 1000,
      });
      return {
        name: file.name.split('/').pop(), 
        url: signedUrl
      };
    }));

    res.json({ success: true, data: photoUrls });
  } catch (error) {
    console.error('取得 GCS 照片失敗:', error);
    res.status(500).json({ success: false, message: '無法取得照片' });
  }
});

// ============================================================================
// 📋 2. 取得該月份「有缺失」的檢查清單 (結合中項與備註欄位)
// ============================================================================
router.get('/list', async (req, res) => {
  const { month, city, user_id, role_level } = req.query;
  if (!month || !user_id) return res.status(400).json({ success: false, message: '缺少參數' });

  try {
    const [regionRows] = await db.query(`SELECT r.name AS city_name, rg.name AS group_name FROM regions r LEFT JOIN report_groups rg ON r.report_group_id = rg.id`);
    let targetCities = [];
    
    if (city) {
      regionRows.forEach(r => {
        if (r.group_name === city) {
          targetCities.push(r.city_name, r.city_name.replace('臺', '台'), r.city_name.replace('台', '臺'));
        }
      });
    } else {
      if (!role_level || parseInt(role_level) < 90) {
        const [authRows] = await db.query(`
          SELECT r.name FROM regions r 
          JOIN user_view_regions uvr ON r.report_group_id = uvr.report_group_id 
          WHERE uvr.user_id = ?
        `, [user_id]);
        authRows.forEach(r => targetCities.push(r.name, r.name.replace('臺', '台'), r.name.replace('台', '臺')));
      } else {
        regionRows.forEach(r => targetCities.push(r.city_name)); 
      }
    }
    
    const validCities = [...new Set(targetCities)];
    if (validCities.length === 0) return res.json({ success: true, data: [] });

    const [usersRows] = await db.query(`SELECT u.emp_id, f.name AS role_name FROM users u LEFT JOIN front_roles f ON u.front_role_id = f.id`);
    const userRoleMap = {};
    usersRows.forEach(u => { if (u.emp_id) userRoleMap[u.emp_id] = u.role_name; });

    const [allRecords] = await db.query(`SELECT * FROM copied_inspections WHERE report_month = ? AND city IN (?) ORDER BY created_at DESC`, [month, validCities]);
    
    const officialRecords = allRecords.filter(row => {
      const role = userRoleMap[row.created_by] || '其他';
      return role !== '營運處';
    });

    // 🌟 從資料庫多抓出 sub_category (中項)
    const [rules] = await db.query(`SELECT item_key, item_name, sub_category, severity FROM scoring_rules WHERE is_active = 1`);
    
    const defectiveList = [];
    
    for (const row of officialRecords) {
      const defects = [];
      rules.forEach(rule => {
        if (row[rule.item_key] === 1) {
          // 🌟 將「中項」與「細項」組合起來
          const subCategoryText = rule.sub_category ? `${rule.sub_category} - ` : '';
          defects.push(`[${rule.severity}級] ${subCategoryText}${rule.item_name}`);
        }
      });

      if (defects.length > 0) {
        row.defect_summary = defects.join('、'); 
        row.defect_list = defects; 
        defectiveList.push({
          id: row.id,
          report_month: row.report_month,
          city: row.city,
          station_name: row.station_name,
          bike_no: row.bike_no || '無/場站缺失',
          model: row.model, // 🌟 包含 2.0 / 2.0E 資訊
          created_at: row.created_at,
          defect_summary: row.defect_summary,
          defect_list: row.defect_list,
          photo_count: 0,
          // 🌟 把各種備註全部帶給前端
          dock_note: row.dock_note || '',
          appearance_note: row.appearance_note || '',
          structure_note: row.structure_note || '',
          other_note: row.other_note || ''
        });
      }
    }

    const bucket = storage.bucket(BUCKET_NAME);
    const chunkSize = 50; 
    
    for (let i = 0; i < defectiveList.length; i += chunkSize) {
      const chunk = defectiveList.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (item) => {
        try {
          const prefix = `inspections/${item.id}/`;
          const [files] = await bucket.getFiles({ prefix });
          const imageFiles = files.filter(file => !file.name.endsWith('/'));
          item.photo_count = imageFiles.length; 
        } catch (err) {
          console.error(`查詢 ${item.id} 照片數量失敗:`, err);
          item.photo_count = 0;
        }
      }));
    }

    res.json({ success: true, data: defectiveList });
  } catch (error) {
    console.error('取得缺失清單失敗:', error);
    res.status(500).json({ success: false, message: '無法取得資料' });
  }
});

module.exports = router;