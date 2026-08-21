//YouBike-inspection-dashboard\backend\routes\monthlySync.js
const express = require('express');
const router = express.Router();
const db = require('../service/db'); 

// 🌟 輔助小工具：自動產生「最近 6 個月」的陣列
const generateLast6Months = () => {
  const months = [];
  const d = new Date();
  d.setDate(1); 
  for (let i = 0; i < 6; i++) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
    d.setMonth(d.getMonth() - 1);
  }
  return months;
};

// ============================================================================
// 🌟 核心共用模組：執行跨庫資料同步 (手動與排程共用)
// ============================================================================
const runDataSync = async (month, operator_id) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(`
      INSERT INTO monthly_reports (report_month, status, imported_at, imported_by, last_sync_time) 
      VALUES (?, 'draft', NOW(), ?, NOW())
      ON DUPLICATE KEY UPDATE 
        status = 'draft',
        imported_at = NOW(),
        imported_by = ?,
        last_sync_time = NOW()
    `, [month, operator_id, operator_id]);

    await connection.query(`DELETE FROM copied_inspections WHERE report_month = ?`, [month]);
    
    const [oldRows] = await connection.query(`
      SELECT *
      FROM \`youbike_inspector\`.inspections 
      WHERE DATE_FORMAT(DATE_ADD(created_at, INTERVAL 8 HOUR), '%Y-%m') = ? 
        AND created_by <> 'GB4952'
    `, [month]);

    console.log(`[同步準備] 來源庫 ${month} 共有 ${oldRows.length} 筆資料`);

    if (oldRows.length > 0) {
      const safeDate = (d) => {
        if (!d) return null;
        if (d instanceof Date && isNaN(d.getTime())) return null; 
        if (typeof d === 'string' && d.includes('0000-00-00')) return null; 
        return d;
      };

      let successCount = 0;
      let errorCount = 0;

      for (const row of oldRows) {
        const data = {
          id: row.id, 
          report_month: month,
          front_role: '', 
          station_id: row.station_id || '',
          city: row.city || '',
          station_name: row.station_name || '',
          bikes_in_dock_count: row.bikes_in_dock_count || 0,
          reversed_saddle_count: row.reversed_saddle_count || 0,
          inactive_bike_count: row.inactive_bike_count || 0,
          // 場站導標桿
          signpost_no_design: (row.signpost_issue & 1) ? 1 : 0,// 無設計圖
          signpost_crooked:   (row.signpost_issue & 2) ? 1 : 0,// 歪斜、毀損
          signpost_missing:   (row.signpost_issue & 4) ? 1 : 0,// 缺漏
          //場站周圍整潔
          station_clean_garbage: (row.station_cleanliness & 1) ? 1 : 0,// 人為廢棄物
          station_clean_leaves:  (row.station_cleanliness & 2) ? 1 : 0, // 落葉、雜草、軟爛果實
          
          station_note: row.station_note || '',
          bike_no: row.bike_no || '',
          model: row.model || '',
          check_date: safeDate(row.check_date),
          first_level_checker: row.checker || '',

          // 一級檢修貼紙
          sticker_missing:         (row.sticker & 1) ? 1 : 0,// 無貼紙
          sticker_unreadable:      (row.sticker & 2) ? 1 : 0,// 資訊不完整/無法辨識
          sticker_old_not_removed: (row.sticker & 4) ? 1 : 0,// 未撕除舊貼紙

          dock_no: row.dock_no || '',

          // 車柱資訊
          dock_info_number:   (row.dock_info & 1) ? 1 : 0,// 柱號文字
          dock_info_station:  (row.dock_info & 2) ? 1 : 0,// 站名文字

          // 外觀及環境
          dock_sticker_sides: (row.dock_appearance_env & 1) ? 1 : 0,// 兩側貼紙
          dock_body_board:    (row.dock_appearance_env & 2) ? 1 : 0,// 柱體／基板
          dock_lock_rust_10:  (row.dock_appearance_env & 4) ? 1 : 0,// 鎖體 10% 生鏽
          dock_garbage:       (row.dock_appearance_env & 8) ? 1 : 0,// 垃圾

          // 太陽能面板
          dock_solar_not:     (row.dock_solar_panel & 1) ? 1 : 0,// 無裝設
          dock_solar_broken:  (row.dock_solar_panel & 2) ? 1 : 0,// 破裂
          dock_solar_moisture:(row.dock_solar_panel & 4) ? 1 : 0,// 水氣

          // 功能檢查
          dock_light_issue:   (row.dock_function_check & 1) ? 1 : 0,// 左下燈光不亮
          dock_wobble:        (row.dock_function_check & 2) ? 1 : 0,// 搖晃
          dock_rent_issue:    (row.dock_function_check & 4) ? 1 : 0,// 借還不順

          // 導引槽
          dock_guide_missing: (row.dock_guide_rail & 1) ? 1 : 0,// 缺漏
          dock_guide_loose:   (row.dock_guide_rail & 2) ? 1 : 0,// 鬆動
          dock_note: row.dock_note || '',

          // 車機：機殼外觀
          headunit_dirty:       (row.headunit_housing & 1) ? 1 : 0,// 髒污／塗鴉／褪色／非規範貼紙
          headunit_broken:      (row.headunit_housing & 2) ? 1 : 0,// 破損／刮痕
          headunit_bubble:      (row.headunit_housing & 4) ? 1 : 0,// 太陽能／文字面板氣泡

          /// 車機：功能測試
          headunit_rent_issue:  (row.headunit_function & 1) ? 1 : 0,// (2次)喚醒畫面卡住
          headunit_unlock_fail: (row.headunit_function & 2) ? 1 : 0,// 刷卡／掃碼後暫停服務／未解鎖／未上鎖
          headunit_screen_issue:(row.headunit_function & 4) ? 1 : 0,// 螢幕文字無完整／異常顯示
          headunit_sound_issue: (row.headunit_function & 8) ? 1 : 0,// 無提示音／音量、音調異常

          
          headunit_other_note:  (row.headunit_function & 16) ? 1 : 0,

          // 車機：費率貼紙 (僅 2.0E 顯示)
          fee_sticker_missing:  (row.fare_sticker & 1) ? 1 : 0,// 無貼紙
          fee_sticker_broken:   (row.fare_sticker & 2) ? 1 : 0, // 破損

          // 置物籃：標示貼紙
          basket_sticker_front: (row.basket_sticker & 1) ? 1 : 0,// 前 車號／LOGO
          basket_sticker_back:  (row.basket_sticker & 2) ? 1 : 0,// 後 使用說明

          // 置物籃：外觀及附屬裝置
          basket_dirty:         (row.basket_issue & 1) ? 1 : 0,// 嚴重髒汙、沾黏、褪色
          basket_garbage:       (row.basket_issue & 2) ? 1 : 0,// 垃圾
          basket_broken:        (row.basket_issue & 4) ? 1 : 0, // 破損2根以上／缺固定螺絲／歪斜
          basket_wire_broken:   (row.basket_issue & 8) ? 1 : 0,// 鉸線頭固定座破損／鉸線破損

          // 把手：標示貼紙
          grip_sticker_left:    (row.handlebar_sticker & 1) ? 1 : 0,// 左 提醒騎乘前檢查
          grip_sticker_right:   (row.handlebar_sticker & 2) ? 1 : 0,// 右 警告煞車提醒

          // 把手：把手套
          grip_worn:            (row.grip_issue & 1) ? 1 : 0,// 黏潮、紋路磨損、破損
          grip_dirty:           (row.grip_issue & 2) ? 1 : 0,// 髒汙致無法使用
          grip_right_broken:    (row.grip_issue & 4) ? 1 : 0,// 右變速軟套破損／缺漏

          // 車鈴
          bell_missing_silent:  (row.bell_issue & 1) ? 1 : 0,// 無車鈴／旋轉無聲響
          bell_sticker_issue:   (row.bell_issue & 2) ? 1 : 0,// 貼紙文字無法辨識

          // 外管完整
          housing_tube:         (row.housing_issue & 1) ? 1 : 0,// 蛇管
          housing_brake:        (row.housing_issue & 2) ? 1 : 0,// 煞車外管
          housing_gear:         (row.housing_issue & 4) ? 1 : 0,// 變速外管

          // 車體：車頭
          frame_head_crooked:   (row.frame_head & 1) ? 1 : 0, // 歪斜
          frame_head_stuck:     (row.frame_head & 2) ? 1 : 0,// 左右轉卡頓／不順暢

          // 車體：車架
          frame_dirty:          (row.frame_body & 1) ? 1 : 0,// 髒污／塗鴉／非規範貼紙
          frame_paint_peeling:  (row.frame_body & 2) ? 1 : 0, // 掉漆

          // 車體：圖樣標示
          sticker_city_logo:    (row.logo_sticker_issue & 1) ? 1 : 0,// 市徽
          sticker_bike_number:  (row.logo_sticker_issue & 2) ? 1 : 0,// 車號
          sticker_youbike_logo: (row.logo_sticker_issue & 4) ? 1 : 0,// Logo

          // 車體：前、後泥除
          fender_dirty_broken:  (row.fenders & 1) ? 1 : 0,// 髒污
          fender_broken:        (row.fenders & 2) ? 1 : 0,// 破損

          // 後泥除貼紙（2.0E 有「電池」，2.0 有「透明膜」）
          rear_fender_ad:       (row.rear_fender_sticker & 1) ? 1 : 0,// 廣告
          rear_fender_logo:     (row.rear_fender_sticker & 2) ? 1 : 0,// YouBike Logo
          rear_fender_bike_no:  (row.rear_fender_sticker & 4) ? 1 : 0,// 車號
          rear_fender_battery:  (row.rear_fender_sticker & 16) ? 1 : 0, // 電池 2.0E only
          fender_transparent_film: (row.rear_fender_sticker & 8) ? 1 : 0,// 透明膜 2.0 only

          // 座管束子貼紙
          seatclamp_sticker_issue: (row.seatclamp_sticker & 1) ? 1 : 0,// 文字圖示無法辨識


          appearance_note: row.appearance_note || '',

          /// 防轉彈簧
          spring_missing:       (row.anti_rotation_spring & 1) ? 1 : 0, // 彈簧
          structure_black_tube: (row.structure_issue & 2) ? 1 : 0,// 黑色保護管

          // 停車腳架
          kickstand_missing:    (row.kickstand_issue & 1) ? 1 : 0,// 脫落／遺失
          kickstand_deformed:   (row.kickstand_issue & 2) ? 1 : 0,// 變形平地無法站立

          // 腳踏
          pedal_missing:        (row.pedal_issue & 1) ? 1 : 0,// 斷裂／遺失
          pedal_deformed:       (row.pedal_issue & 2) ? 1 : 0,// 變形歪斜／生鏽

          // 隨車鎖
          lock_fail:            (row.bike_lock_issue & 1) ? 1 : 0,// 上鎖／解鎖失敗
          lock_sticker_issue:   (row.bike_lock_issue & 2) ? 1 : 0,// 貼紙無法辨識／無貼紙
          lock_rust_10:         (row.bike_lock_issue & 4) ? 1 : 0,// 鎖體生鏽10%

          // 座墊
          saddle_crooked:        (row.saddle_issue & 1) ? 1 : 0,// 裝設歪斜
          saddle_loose:          (row.saddle_issue & 2) ? 1 : 0,// 未鎖固搖晃
          saddle_broken_base:    (row.saddle_issue & 4) ? 1 : 0,// 底部固定斷裂／與座墊桿分離
          saddle_surface_broken: (row.saddle_issue & 8) ? 1 : 0,// 表面破損／龜裂
          saddle_dirty:          (row.saddle_issue & 16) ? 1 : 0,// 髒汙致無法騎乘

          // 座墊桿：高度調整
          seatpost_locked:       (row.seatpost_height_adjust & 1) ? 1 : 0,// 無法調整（鎖死）
          seatpost_slip:         (row.seatpost_height_adjust & 2) ? 1 : 0,// 無法固定（滑落）
          seatpost_stuck:        (row.seatpost_height_adjust & 4) ? 1 : 0,// 不順暢（卡頓嚴重）
          seatpost_lever_broken: (row.seatpost_height_adjust & 8) ? 1 : 0,// 黃色拉桿斷裂

          // 座墊桿：定位異常
          seatpost_reverse_unfixed: (row.seatpost_positioning_abnormal & 1) ? 1 : 0,// 反轉後無法固定位置
          seatpost_reverse_wrong_pos: (row.seatpost_positioning_abnormal & 2) ? 1 : 0,// 座墊未在最底部就可反轉
          seatpost_wobble:      (row.seatpost_positioning_abnormal & 4) ? 1 : 0,// 拉高後搖晃
          seatpost_separated:   (row.seatpost_positioning_abnormal & 8) ? 1 : 0,// 與車體分離
          seatpost_scale_blur:  (row.seatpost_positioning_abnormal & 16) ? 1 : 0,// 刻度模糊
          
          structure_note: row.structure_note || '',

          // 輪胎
          tire_worn:            (row.tire_issue & 1) ? 1 : 0,// 胎紋磨損／平滑／龜裂／反光帶脫落
          tire_rim_deformed:    (row.tire_issue & 2) ? 1 : 0,// 輪框變形／缺鋼絲
          tire_wobble:          (row.tire_issue & 4) ? 1 : 0,// 前後輪偏擺

          // 輪軸螺絲
          axle_bolt_front:      (row.axle_bolt_issue & 1) ? 1 : 0,// 前
          axle_bolt_rear:       (row.axle_bolt_issue & 2) ? 1 : 0,// 後

          // 變速功能
          gear_silver_cap_missing: (row.gear_issue & 1) ? 1 : 0,// 銀蓋脫落
          gear_black_cap_missing:  (row.gear_issue & 2) ? 1 : 0,// 黑蓋脫落／檔位標示模糊
          gear_stuck:           (row.gear_issue & 4) ? 1 : 0,// 換檔不順（2 轉 3 卡）
          gear_slip:            (row.gear_issue & 8) ? 1 : 0,// 檔位無法定位（有變速無法固定）
          gear_fail:            (row.gear_issue & 16) ? 1 : 0,// 無法變速／變速器脫落

          // 煞車功能
          brake_fail:           (row.brake_issue & 1) ? 1 : 0,// 無法煞車
          brake_loose:          (row.brake_issue & 2) ? 1 : 0,// 過鬆（2/3）
          brake_tight:          (row.brake_issue & 4) ? 1 : 0,// 過緊（1/3）
          brake_noise:          (row.brake_issue & 8) ? 1 : 0, // 異音

          // 前後燈（行進）
          lights_moving_front:  (row.lights_moving & 1) ? 1 : 0,// 前
          lights_moving_rear:   (row.lights_moving & 2) ? 1 : 0,// 後

          // 前後燈（靜止）
          lights_stationary_not_lit: (row.lights_stationary & 1) ? 1 : 0,// 借出刷卡未亮
          lights_stationary_not_off: (row.lights_stationary & 2) ? 1 : 0, // 歸還靠柱未滅
          lights_stationary_flicker: (row.lights_stationary & 4) ? 1 : 0, // 借出後閃爍／未恆亮
          lights_reflector_broken:   (row.lights_stationary & 8) ? 1 : 0,// 後燈下反光片破損

          // 電量
          ride_unsmooth:        (row.ride_test_issue & 1) ? 1 : 0,// 無顯示
          chain_noise:          (row.ride_test_issue & 2) ? 1 : 0,// 借出低於 15%
          ride_noise:           (row.ride_test_issue & 4) ? 1 : 0,// 未持續顯示
          
          // 🌟 1. 嚴謹讀取胎壓數值 (空值保留 null，避免誤判為 0)
          front_tire_psi: (row.front_tire_psi !== null && row.front_tire_psi !== '') ? Number(row.front_tire_psi) : null,
          rear_tire_psi: (row.rear_tire_psi !== null && row.rear_tire_psi !== '') ? Number(row.rear_tire_psi) : null,

          // 🌟 2. 自動判斷胎壓級別並打勾 (只要有一輪中標就算缺失)
          tire_pressure_too_low: (
            (row.front_tire_psi !== null && row.front_tire_psi !== '' && Number(row.front_tire_psi) < 50) || 
            (row.rear_tire_psi !== null && row.rear_tire_psi !== '' && Number(row.rear_tire_psi) < 50)
          ) ? 1 : 0,
          
          tire_pressure_too_high: (
            (row.front_tire_psi !== null && row.front_tire_psi !== '' && Number(row.front_tire_psi) > 90) || 
            (row.rear_tire_psi !== null && row.rear_tire_psi !== '' && Number(row.rear_tire_psi) > 90)
          ) ? 1 : 0,
          
          tire_pressure_slightly_high: (
            (row.front_tire_psi !== null && row.front_tire_psi !== '' && Number(row.front_tire_psi) > 75 && Number(row.front_tire_psi) <= 90) || 
            (row.rear_tire_psi !== null && row.rear_tire_psi !== '' && Number(row.rear_tire_psi) > 75 && Number(row.rear_tire_psi) <= 90)
          ) ? 1 : 0,

          other_note: row.other_note || '',

          battery_level: row.battery_pct || 0,
          battery_appearance_blank: (row.power_battery_issue & 1) ? 1 : 0,
          battery_low: (row.power_battery_issue & 2) ? 1 : 0,
          battery_no_display: ((row.power_battery_issue & 1) || (row.power_battery_issue & 4)) ? 1 : 0,

          // 電輔車作動
          ebike_no_power:       (row.assist_behavior & 1) ? 1 : 0,// 騎行踩動 無動力推進
          ebike_power_when_stopped: (row.assist_behavior & 2) ? 1 : 0,// 停車靜止 有動力推進


          ebike_no_speed_sensor: (row.speed_issue & 1) ? 1 : 0,
          ebike_speed_display_issue: (row.speed_issue & 2) ? 1 : 0,
          ebike_speed_not_zero:  (row.speed_issue & 4) ? 1 : 0,
          power_note: row.power_note || '',
          
          photo_count: row.photo_count || 0,
          photo_url: row.photo_url || '',
          created_by: row.created_by || '',
          created_at: safeDate(row.created_at),
          updated_by: null,
          updated_at: null
        };

        try {
          await connection.query(`INSERT INTO copied_inspections SET ?`, [data]);
          successCount++;
        } catch (err) {
          errorCount++;
        }
      }
    }

    await connection.query(`
      UPDATE copied_inspections m
      LEFT JOIN users u ON m.created_by = u.emp_id
      LEFT JOIN front_roles fr ON u.front_role_id = fr.id
      SET m.front_role = IF(fr.name = '無角色' OR fr.name IS NULL, '', fr.name)
      WHERE m.report_month = ?
    `, [month]);

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};


// ============================================================================
// 📋 1. 取得月度報表清單 
// ============================================================================
router.get('/list', async (req, res) => {
  try {
    const last6Months = generateLast6Months(); 
    const [dbRecords] = await db.query(`
      SELECT report_month, status, imported_at, imported_by, last_sync_time 
      FROM monthly_reports 
      WHERE report_month IN (?)
    `, [last6Months]);

    const dbRecordMap = {};
    dbRecords.forEach(record => {
      dbRecordMap[record.report_month] = record;
    });

    const finalData = last6Months.map(month => ({
      report_month: month,
      status: dbRecordMap[month] ? dbRecordMap[month].status : 'pending',
      last_sync_time: dbRecordMap[month] ? dbRecordMap[month].last_sync_time : null
    }));

    res.json({ success: true, data: finalData });
  } catch (error) {
    res.status(500).json({ success: false, message: '取得列表失敗' });
  }
});


// ============================================================================
// 🌟 2. 自動排程 API：跨月自動建檔，且對當月「pending」或「draft」自動執行同步
// ============================================================================
router.post('/cron-daily-sync', async (req, res) => {
  const d = new Date();
  const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  try {
    const [existing] = await db.query(`SELECT status FROM monthly_reports WHERE report_month = ?`, [currentMonth]);
    
    if (existing.length === 0) {
      console.log(`[自動排程] 偵測到跨月！自動建立 ${currentMonth} 的報表紀錄...`);
      await db.query(`
        INSERT INTO monthly_reports (report_month, status, imported_by, created_at, updated_at) 
        VALUES (?, 'pending', 'System', NOW(), NOW())
      `, [currentMonth]);
    }

    const [reports] = await db.query(`SELECT status FROM monthly_reports WHERE report_month = ?`, [currentMonth]);
    
    if (reports.length > 0 && ['pending', 'draft'].includes(reports[0].status)) {
      console.log(`[自動排程] 開始同步當月 (${currentMonth}) 的最新資料...`);
      
      // 🌟 關鍵修復：這裡呼叫了真正的搬資料函式！
      await runDataSync(currentMonth, 'System (Cron)');
      
      console.log(`[自動排程] ${currentMonth} 資料同步完成！`);
      return res.json({ success: true, message: `${currentMonth} 排程與更新成功` });
    }

    return res.json({ success: true, message: `已確保 ${currentMonth} 存在。當前狀態為 ${reports[0]?.status}，不執行資料覆蓋` });
  } catch (error) {
    console.error(`[自動排程] 執行失敗:`, error);
    return res.status(500).json({ success: false, message: '排程執行失敗' });
  }
});

// ============================================================================
// 🚀 3. 手動觸發 API：執行跨庫資料同步
// ============================================================================
router.post('/sync', async (req, res) => {
  const { month, operator_id } = req.body; 
  if (!month) return res.status(400).json({ success: false, message: '缺少月份' });

  try {
    // 🌟 關鍵修復：手動點擊也呼叫同一個真正的搬資料函式！
    await runDataSync(month, operator_id);
    res.json({ success: true, message: `${month} 資料同步與解壓縮成功！` });
  } catch (error) {
    console.error('同步失敗:', error);
    res.status(500).json({ success: false, message: '資料同步失敗' });
  }
});

// ============================================================================
// 🔒 4. 鎖定發布 
// ============================================================================
router.post('/publish', async (req, res) => {
  const { month } = req.body;
  try {
    await db.query(`UPDATE monthly_reports SET status = 'published' WHERE report_month = ?`, [month]);
    res.json({ success: true, message: `${month} 已成功發布` });
  } catch (error) {
    res.status(500).json({ success: false, message: '發布失敗' });
  }
});

module.exports = router;