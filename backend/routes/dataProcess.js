//backend/routes/dataProcess.js
const express = require('express');
const router = express.Router();
const db = require('../service/db');

// ============================================================================
// 🔍 GET /api/data-process/filters (動態撈取月份、縣市、評分人員)
// ============================================================================
router.get('/filters', async (req, res) => {
  try {
    const [monthRows] = await db.query(`SELECT DISTINCT report_month FROM copied_inspections ORDER BY report_month DESC`);
    const [cityRows] = await db.query(`SELECT DISTINCT city FROM copied_inspections WHERE city IS NOT NULL AND city != '' ORDER BY city ASC`);
    const [checkerRows] = await db.query(`SELECT DISTINCT created_by AS checker FROM copied_inspections WHERE created_by IS NOT NULL AND created_by != '' ORDER BY created_by ASC`);

    res.json({ 
      success: true, 
      data: {
        months: monthRows.map(r => r.report_month),
        cities: cityRows.map(r => r.city),
        checkers: checkerRows.map(r => r.checker)
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '撈取篩選選項失敗' });
  }
});

// ============================================================================
// 📊 GET /api/data-process/stations (場站總覽)
// ============================================================================
router.get('/stations', async (req, res) => {
  const { month } = req.query; 
  if (!month) return res.status(400).json({ success: false, message: '缺少月份參數' });

  try {
    const sql = `
      SELECT 
        m.station_id, m.station_name, m.city, m.created_by AS checker, 
        IF(fr.name = '無角色' OR fr.name IS NULL, '', fr.name) AS front_role, 
        DATE_FORMAT(MAX(m.created_at), '%Y-%m-%d %H:%i:%s') AS created_at,
        
        MAX(m.bikes_in_dock_count) AS bikes_in_dock_count,
        MAX(m.reversed_saddle_count) AS reversed_saddle_count,
        MAX(m.inactive_bike_count) AS inactive_bike_count,
        MAX(m.station_note) AS station_note,
        
        MAX(m.signpost_no_design) AS signpost_no_design,
        MAX(m.signpost_crooked) AS signpost_crooked,
        MAX(m.signpost_missing) AS signpost_missing,
        MAX(m.station_clean_garbage) AS station_clean_garbage,
        MAX(m.station_clean_leaves) AS station_clean_leaves
      FROM copied_inspections m
      LEFT JOIN users u ON m.created_by = u.emp_id 
      LEFT JOIN front_roles fr ON u.front_role_id = fr.id
      WHERE m.report_month = ?
      GROUP BY m.station_id, m.station_name, m.city, m.created_by, fr.name
      ORDER BY created_at DESC;
    `;
    const [rows] = await db.query(sql, [month]);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '伺服器發生錯誤' });
  }
});

// ============================================================================
// 📄 GET /api/data-process/flat-bikes (單車明細 - 🌟 後端分頁優化版)
// ============================================================================
router.get('/flat-bikes', async (req, res) => {
  // 🌟 1. 接收前端傳來的 page(頁碼) 與 limit(每頁筆數)，預設為第1頁、50筆
  const { month, city, checker, page = 1, limit = 50 } = req.query;
  if (!month) return res.status(400).json({ success: false, message: '缺少月份參數' });

  try {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitValue = parseInt(limit);

    // 🌟 2. 第一句 SQL：先算出符合條件的「總筆數」，給前端分頁器使用
    let countSql = `SELECT COUNT(*) as total FROM copied_inspections m WHERE m.report_month = ?`;
    let countParams = [month];
    if (city) { countSql += ` AND m.city = ?`; countParams.push(city); }
    if (checker && checker !== 'ALL') { countSql += ` AND m.created_by = ?`; countParams.push(checker); }
    const [[{ total }]] = await db.query(countSql, countParams);

    // 🌟 3. 第二句 SQL：只撈出當下那 50 筆資料
    let sql = `
      SELECT 
        m.*, 
        m.created_by AS checker, 
        IF(fr.name = '無角色' OR fr.name IS NULL, '', fr.name) AS front_role, 
        m.model, 
        DATE_FORMAT(m.check_date, '%Y-%m-%d') AS formatted_check_date,
        DATE_FORMAT(m.created_at, '%Y/%m/%d %H:%i:%s') AS formatted_created_at,
        (SELECT COUNT(*) FROM \`youbike_inspector\`.\`inspection_photos\` p WHERE p.inspection_id = m.id) AS photo_count
      FROM copied_inspections m
      LEFT JOIN users u ON m.created_by = u.emp_id 
      LEFT JOIN front_roles fr ON u.front_role_id = fr.id
      WHERE m.report_month = ?
    `;
    let params = [month];

    if (city) { sql += ` AND m.city = ?`; params.push(city); }
    if (checker && checker !== 'ALL') { sql += ` AND m.created_by = ?`; params.push(checker); }
    
    // 加入 LIMIT 與 OFFSET 限制回傳數量
    sql += ` ORDER BY m.created_at DESC, m.station_name ASC, m.bike_no ASC LIMIT ? OFFSET ?`;
    params.push(limitValue, offset);
    
    const [rows] = await db.query(sql, params);
    
    // 🌟 4. 將 total 一併回傳
    res.json({ success: true, data: rows, total });
  } catch (error) {
    res.status(500).json({ success: false, message: '伺服器發生錯誤' });
  }
});

// ============================================================================
// 🧹 PUT /api/data-process/batch-reset (批次歸零 - 🌟 更新至全新白名單)
// ============================================================================
router.put('/batch-reset', async (req, res) => {
  const { month, field, targetChecker } = req.body;
  if (!month || !field) return res.status(400).json({ success: false });

  // 🌟 將新表中所有的 TINYINT 異常開關與數量統計全部納入白名單 (刪除舊的廢棄欄位)
  const allowedFields = [
    // 數量與基礎開關
    'bikes_in_dock_count', 'reversed_saddle_count', 'inactive_bike_count',
    'signpost_no_design', 'signpost_crooked', 'signpost_missing', 'station_clean_garbage', 'station_clean_leaves',
    'dock_sticker_sides', 'dock_body_board', 'dock_lock_rust', 'dock_garbage', 'dock_info_number', 'dock_info_station', 'dock_solar_broken', 'dock_solar_moisture', 'dock_solar_not', 'dock_light_issue', 'dock_wobble', 'dock_rent_issue', 'dock_guide_missing', 'dock_guide_loose',
    // 自行車外觀
    'sticker_missing', 'sticker_unreadable', 'sticker_old_not_removed', 'fee_sticker_missing', 'fee_sticker_broken', 'headunit_dirty', 'headunit_broken', 'headunit_bubble', 'basket_sticker_front', 'basket_sticker_back', 'basket_dirty', 'basket_garbage', 'basket_broken', 'basket_wire_broken', 'grip_sticker_left', 'grip_sticker_right', 'grip_worn', 'grip_dirty', 'grip_right_broken', 'bell_missing_silent', 'bell_sticker_issue', 'frame_dirty', 'frame_paint_peeling', 'fender_dirty_broken', 'fender_broken', 'rear_fender_ad', 'rear_fender_logo', 'rear_fender_bike_no', 'fender_transparent_film', 'rear_fender_battery', 'seatclamp_sticker_issue', 'saddle_surface_broken', 'saddle_dirty', 'axle_bolt_front', 'axle_bolt_rear', 'housing_tube', 'housing_brake', 'housing_gear', 'lock_sticker_issue', 'lock_rust_10', 'sticker_city_logo', 'sticker_bike_number', 'sticker_youbike_logo', 'structure_black_tube',
    // 自行車機能
    'battery_appearance_blank', 'battery_low', 'battery_no_display', 'headunit_unlock_fail', 'headunit_rent_issue', 'headunit_screen_issue', 'headunit_sound_issue', 'headunit_other_note', 'spring_missing', 'kickstand_missing', 'kickstand_deformed', 'frame_head_crooked', 'frame_head_stuck', 'seatpost_reverse_unfixed', 'seatpost_reverse_wrong_pos', 'seatpost_wobble', 'seatpost_separated', 'seatpost_scale_blur', 'saddle_crooked', 'saddle_loose', 'saddle_broken_base', 'seatpost_locked', 'seatpost_slip', 'seatpost_stuck', 'seatpost_lever_broken', 'tire_worn', 'tire_rim_deformed', 'tire_wobble', 'lights_moving_front', 'lights_moving_rear', 'lights_stationary_not_lit', 'lights_stationary_not_off', 'lights_stationary_flicker', 'lights_reflector_broken', 'brake_fail', 'brake_loose', 'brake_tight', 'brake_noise', 'gear_silver_cap_missing', 'gear_black_cap_missing', 'gear_stuck', 'gear_slip', 'gear_fail', 'lock_fail', 'ride_unsmooth', 'chain_noise', 'ride_noise', 'pedal_missing', 'pedal_deformed','tire_pressure_too_low', 'tire_pressure_too_high', 'tire_pressure_slightly_high',
    // 電輔車
    'ebike_no_power', 'ebike_power_when_stopped', 'ebike_no_speed_sensor', 'ebike_speed_display_issue', 'ebike_speed_not_zero'
  ];

  if (!allowedFields.includes(field)) return res.status(403).json({ success: false, message: '無效欄位' });

  try {
    let sql = `UPDATE copied_inspections SET ?? = 0 WHERE report_month = ?`;
    let params = [field, month];
    if (targetChecker && targetChecker !== 'ALL') {
      sql += ` AND created_by = ?`;
      params.push(targetChecker);
    }
    const [result] = await db.query(sql, params);
    res.json({ success: true, message: '批次歸零成功！', affectedRows: result.affectedRows });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// ============================================================================
// 💾 PUT 即時存檔 API (場站 & 單車)
// ============================================================================
router.put('/update-station-cell', async (req, res) => {
  const { month, station_id, field, value } = req.body;
  try {
    await db.query(`UPDATE copied_inspections SET ?? = ? WHERE report_month = ? AND station_id = ?`, [field, value, month, station_id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false }); }
});

router.put('/update-bike-cell', async (req, res) => {
  const { id, field, value } = req.body;
  try {
    await db.query(`UPDATE copied_inspections SET ?? = ? WHERE id = ?`, [field, value, id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false }); }
});

// ============================================================================
// 🗑️ POST / DELETE 多選與單選刪除 API
// ============================================================================
router.post('/batch-delete-stations', async (req, res) => {
  const { month, stationIds } = req.body;
  try {
    const [result] = await db.query(`DELETE FROM copied_inspections WHERE report_month = ? AND station_id IN (?)`, [month, stationIds]);
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (error) { res.status(500).json({ success: false }); }
});

router.post('/batch-delete-bikes', async (req, res) => {
  const { ids } = req.body;
  try {
    const [result] = await db.query(`DELETE FROM copied_inspections WHERE id IN (?)`, [ids]);
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (error) { res.status(500).json({ success: false }); }
});

router.delete('/stations/:month/:stationId', async (req, res) => {
  const { month, stationId } = req.params;
  try {
    await db.query(`DELETE FROM copied_inspections WHERE report_month = ? AND station_id = ?`, [month, stationId]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false }); }
});

// ============================================================================
// 📥 POST /api/data-process/batch-update-bikes (Excel批次更新/刪除)
// ============================================================================
router.post('/batch-update-bikes', async (req, res) => {
  const { month, updates, stationUpdates, isFirstChunk, allValidIds } = req.body;

  if (!month) return res.status(400).json({ success: false, message: '參數錯誤' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 🗑️ 第一批資料進來時：清理不在 Excel 名單上的單車
    if (isFirstChunk) {
      if (Array.isArray(allValidIds) && allValidIds.length > 0) {
        await connection.query(
          `DELETE FROM copied_inspections WHERE report_month = ? AND id NOT IN (?)`,
          [month, allValidIds]
        );
      } else {
        await connection.query(`DELETE FROM copied_inspections WHERE report_month = ?`, [month]);
      }
    }

    // 2. 🚲 更新單車 (只使用 UPDATE，保證車號、場站等基本欄位不會被洗白)
    if (Array.isArray(updates) && updates.length > 0) {
      for (const row of updates) {
        const { id, ...fields } = row;
        const keys = Object.keys(fields);
        if (keys.length === 0) continue;
        
        const setClause = keys.map(k => `\`${k}\` = ?`).join(', ');
        const values = Object.values(fields);

        await connection.query(
          `UPDATE copied_inspections SET ${setClause} WHERE id = ?`,
          [...values, id]
        );
      }
    }

    // 3. 🏠 更新場站 (也是 UPDATE)
    if (isFirstChunk && Array.isArray(stationUpdates) && stationUpdates.length > 0) {
      const stationPromises = stationUpdates.map(st => {
        // 🌟 徹底拔除 created_at！我們只用 month, station_name, created_by 就能 100% 命中資料庫
        const { station_name, created_by, created_at, city, ...fields } = st; 
        
        if (!station_name) return Promise.resolve();
        
        const keys = Object.keys(fields);
        if (keys.length === 0) return Promise.resolve();
        
        const setClause = keys.map(k => `\`${k}\` = ?`).join(', ');
        const values = Object.values(fields);

        // 基本條件：月份與場站名稱
        let sql = `UPDATE copied_inspections SET ${setClause} WHERE report_month = ? AND station_name = ?`;
        let queryParams = [...values, month, station_name];

        // 進階條件：如果有工號，就加上工號比對確保安全
        if (created_by && created_by !== '') {
          sql += ` AND created_by = ?`;
          queryParams.push(created_by);
        }

        return connection.query(sql, queryParams);
      });
      // 🚀 使用 Promise.all 平行處理，瞬間完成！
      await Promise.all(stationPromises); 
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('匯入失敗:', error);
    res.status(500).json({ success: false });
  } finally {
    connection.release();
  }
});

module.exports = router;