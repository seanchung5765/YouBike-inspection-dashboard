const express = require('express');
const router = express.Router();
const db = require('../service/db');
const cron = require('node-cron');

// 輔助函數：將計算結果精確保留至小數點後四位，消除 JavaScript 浮點數運算誤差
const calcTo4 = (num) => parseFloat(Number(num).toFixed(4));

// ============================================================================
// 核心結算引擎：負責計算官方巡檢分數、營運處自評分數、可動率與一級維護率懲罰
// ============================================================================
const calculateMonthlyScores = async (month) => {
  console.log(`[排程啟動] 開始計算 ${month} 月份總分與缺失統計...`);
  try {
    // 1. 撈取基礎資料：當月巡檢紀錄、計分規則、使用者權限、手動填寫的維護資料
    const [records] = await db.query(`SELECT * FROM copied_inspections WHERE report_month = ?`, [month]);
    const [rules] = await db.query(`SELECT * FROM scoring_rules WHERE is_active = 1`);

    const [usersRows] = await db.query(`SELECT u.name, u.emp_id, f.name AS role_name FROM users u LEFT JOIN front_roles f ON u.front_role_id = f.id`);
    const userRoleMap = {};
    usersRows.forEach(u => {
      if(u.name) userRoleMap[u.name] = u.role_name;
      if(u.emp_id) userRoleMap[u.emp_id] = u.role_name;
    });

    const [oldScores] = await db.query(`
      SELECT city, total_fleet_bikes, accident_bikes, broken_bikes, maintenance_records 
      FROM city_monthly_scores WHERE report_month = ?
    `, [month]);
    const manualDataMap = {};
    oldScores.forEach(row => { manualDataMap[row.city] = row; });

    // 2. 計算各計分類別的「最高滿分基準 (分母)」
    const mergeGroupCatMap = {};
    rules.forEach(r => { if (r.merge_group) mergeGroupCatMap[r.merge_group] = r.major_category; });

    const maxDeductionMap = { '場站': 0, '自行車外觀與重要標示': 0, '自行車重要機能': 0 };
    let mergeGroupMaxMap = {};
    
    rules.forEach(rule => {
      const pts = Math.abs(parseFloat(rule.deduction_points || 0));
      if (rule.merge_group) mergeGroupMaxMap[rule.merge_group] = Math.max(mergeGroupMaxMap[rule.merge_group] || 0, pts);
      else if (maxDeductionMap[rule.major_category] !== undefined) maxDeductionMap[rule.major_category] += pts;
    });

    Object.keys(mergeGroupMaxMap).forEach(group => {
      const pts = mergeGroupMaxMap[group];
      const cat = mergeGroupCatMap[group];
      if (maxDeductionMap[cat] !== undefined) maxDeductionMap[cat] += pts;
    });

    const sumMaxStation = maxDeductionMap['場站'];
    const sumMaxAppearance = maxDeductionMap['自行車外觀與重要標示']+4;
    const sumMaxFunction = maxDeductionMap['自行車重要機能'];
    const sumMaxTotal = sumMaxStation + sumMaxAppearance + sumMaxFunction;

    // 3. 準備各縣市與大區的統計容器
    const [regionRows] = await db.query(`SELECT r.name AS city_name, rg.name AS group_name FROM regions r LEFT JOIN report_groups rg ON r.report_group_id = rg.id`);
    const cityToGroupMap = {};
    regionRows.forEach(r => {
      if (r.city_name && r.group_name) {
        cityToGroupMap[r.city_name] = r.group_name;
        cityToGroupMap[r.city_name.replace('臺', '台')] = r.group_name;
        cityToGroupMap[r.city_name.replace('台', '臺')] = r.group_name;
      }
    });

    const groupStats = {};
    const distinctGroups = [...new Set(Object.values(cityToGroupMap))].filter(g => g);
    
    distinctGroups.forEach(g => {
      groupStats[g] = { 
        official: {
          unique_stations: new Set(), inspection_events: new Set(), 
          total_bikes: 0, ebikes_count: 0, tire_fail_count: 0,
          raw_station_deduction: 0, raw_appearance_deduction: 0, raw_function_deduction: 0,
          inspection_count: 0, total_docked_bikes: 0, unrentable_bikes: 0,
          deduction_total: 0, deduction_2_0: 0, deduction_2_0e: 0,
          raw_appearance_deduction_2_0: 0, raw_function_deduction_2_0: 0,
          raw_appearance_deduction_2_0e: 0, raw_function_deduction_2_0e: 0,
          anomalies_2_0: 0, anomalies_2_0e: 0,
          // 🌟 [新增] 用來記錄「缺失統計表」各項目異常件數的容器
          issueCounts: {} 
        },
        ops: { total_bikes: 0, deduction_total: 0 } 
      };
      // 🌟 [新增] 預先為每個項目建立計數器
      rules.forEach(rule => {
        groupStats[g].official.issueCounts[rule.item_key] = 0;
      });
    });

    // 4. 逐車結算：掃描每筆巡檢紀錄，累加扣分與異常件數
    records.forEach(row => {
      const creatorRole = userRoleMap[row.created_by] || '其他';
      const rawCity = row.city ? row.city.trim() : '未知';
      const groupName = cityToGroupMap[rawCity] || '未分類';
      if (groupName === '未分類') return;

      if (creatorRole === '營運處') {
        const opsPool = groupStats[groupName].ops;
        if (row.bike_no) opsPool.total_bikes += 1;
        let rowTotalDeduction = 0; 
        let mergeBuckets = {}; 
        rules.forEach(rule => {
          if (row[rule.item_key] === 1) {
            const points = parseFloat(rule.deduction_points || 0);
            if (rule.merge_group) mergeBuckets[rule.merge_group] = Math.min(mergeBuckets[rule.merge_group] || 0, points);
            else rowTotalDeduction += points;
          }
        });
        Object.values(mergeBuckets).forEach(pts => rowTotalDeduction += pts);
        opsPool.deduction_total += rowTotalDeduction;

      } else {
        const statPool = groupStats[groupName].official;
        
        if (row.station_name) {
          statPool.unique_stations.add(row.station_name);
          let pureDate = 'unknown_date';
          if (row.created_at) {
            const d = new Date(row.created_at);
            pureDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; 
          }
          const eventKey = `${row.station_name}_${pureDate}_${row.created_by}`;
          if (!statPool.inspection_events.has(eventKey)) {
            statPool.inspection_events.add(eventKey);
            statPool.inspection_count += 1;
            statPool.total_docked_bikes += parseInt(row.bikes_in_dock_count) || 0;
            statPool.unrentable_bikes += (parseInt(row.reversed_saddle_count) || 0) + (parseInt(row.inactive_bike_count) || 0);
          }
        }
        
        if (row.bike_no) {
          statPool.total_bikes += 1;
          if (row.model === '2.0E') statPool.ebikes_count += 1;
          
          const front = row.front_tire_psi;
          const rear = row.rear_tire_psi;
          const isFrontFail = front !== null && front !== '' && (Number(front) < 50 || Number(front) > 75);
          const isRearFail = rear !== null && rear !== '' && (Number(rear) < 50 || Number(rear) > 75);
          
          if (isFrontFail || isRearFail) {
            statPool.tire_fail_count += 1;
          }
        }

        let rowTotalDeduction = 0; 
        let rowBikeDeduction = 0; 
        let mergeBuckets = {}; 
        
        let anomalyGroups = new Set();
        let independentAnomalies = 0;  

        rules.forEach(rule => {
          if (row[rule.item_key] === 1) {
            
            // 🌟 [新增] 如果這項缺失被打勾，就幫這縣市的這項缺失計數 +1
            statPool.issueCounts[rule.item_key] += 1;

            const points = parseFloat(rule.deduction_points || 0);
            if (rule.merge_group) {
              mergeBuckets[rule.merge_group] = Math.min(mergeBuckets[rule.merge_group] || 0, points);
              if (rule.major_category !== '場站') {
                anomalyGroups.add(rule.merge_group); 
              }
            } 
            else {
              rowTotalDeduction += points;
              if (rule.major_category !== '場站') {
                rowBikeDeduction += points;
                independentAnomalies += 1;
                
                if (rule.major_category === '自行車外觀與重要標示') {
                  if (row.model === '2.0E') statPool.raw_appearance_deduction_2_0e += points;
                  else statPool.raw_appearance_deduction_2_0 += points;
                }
                if (rule.major_category === '自行車重要機能') {
                  if (row.model === '2.0E') statPool.raw_function_deduction_2_0e += points;
                  else statPool.raw_function_deduction_2_0 += points;
                }
              }
              if (rule.major_category === '場站') statPool.raw_station_deduction += points;
              if (rule.major_category === '自行車外觀與重要標示') statPool.raw_appearance_deduction += points;
              if (rule.major_category === '自行車重要機能') statPool.raw_function_deduction += points;
            }
          }
        });

        Object.keys(mergeBuckets).forEach(group => {
          const points = mergeBuckets[group];
          rowTotalDeduction += points;
          const cat = mergeGroupCatMap[group];
          if (cat !== '場站') {
            rowBikeDeduction += points;
            if (cat === '自行車外觀與重要標示') {
              if (row.model === '2.0E') statPool.raw_appearance_deduction_2_0e += points;
              else statPool.raw_appearance_deduction_2_0 += points;
            }
            if (cat === '自行車重要機能') {
              if (row.model === '2.0E') statPool.raw_function_deduction_2_0e += points;
              else statPool.raw_function_deduction_2_0 += points;
            }
          }
          if (cat === '場站') statPool.raw_station_deduction += points;
          if (cat === '自行車外觀與重要標示') statPool.raw_appearance_deduction += points;
          if (cat === '自行車重要機能') statPool.raw_function_deduction += points;
        });

        statPool.deduction_total += rowTotalDeduction;
        const totalBikeAnomalies = independentAnomalies + anomalyGroups.size;

        if (row.model === '2.0E') {
          statPool.deduction_2_0e += rowBikeDeduction; 
          statPool.anomalies_2_0e += totalBikeAnomalies;
        } else {
          statPool.deduction_2_0 += rowBikeDeduction; 
          statPool.anomalies_2_0 += totalBikeAnomalies;
        }
      }
    });

    await db.query(`DELETE FROM city_monthly_scores WHERE report_month = ?`, [month]);
    
    // 🌟 [新增] 清空這個月舊的缺失統計資料，準備寫入新的
    await db.query(`DELETE FROM city_issue_stats WHERE report_month = ?`, [month]);

    const nat = {
      tested_stations: 0, total_bikes: 0, bikes_2_0_count: 0, ebikes_count: 0, tire_fail_count: 0,
      raw_station_deduction: 0, raw_appearance_deduction: 0, raw_function_deduction: 0,
      raw_appearance_deduction_2_0: 0, raw_function_deduction_2_0: 0,
      raw_appearance_deduction_2_0e: 0, raw_function_deduction_2_0e: 0,
      inspection_count: 0, total_docked_bikes: 0, unrentable_bikes: 0,
      total_fleet_bikes: 0, accident_bikes: 0, broken_bikes: 0, maintenance_records: 0,
      deduction_total: 0, deduction_2_0: 0, deduction_2_0e: 0,
      anomalies_2_0: 0, anomalies_2_0e: 0
    };

    // 5. 計算各縣市的各項最終成績
    for (const [groupName, pools] of Object.entries(groupStats)) {
      const stat = pools.official;
      const opsStat = pools.ops;

      // 🌟 [新增] 將這個縣市算好的缺失統計，批次寫入資料庫
      if (stat.total_bikes > 0) {
        for (const [itemKey, failCount] of Object.entries(stat.issueCounts)) {
          const failRate = calcTo4((failCount / stat.total_bikes) * 100);
          await db.query(`
            INSERT INTO city_issue_stats (report_month, city, item_key, fail_count, fail_rate)
            VALUES (?, ?, ?, ?, ?)
          `, [month, groupName, itemKey, failCount, failRate.toFixed(2)]);
        }
      }

      const tireFailRate = stat.total_bikes > 0 ? calcTo4((stat.tire_fail_count / stat.total_bikes) * 100) : 0;
      const count_2_0e = stat.ebikes_count;
      const count_2_0 = stat.total_bikes - count_2_0e;

      const calculateYourFormula = (A, Ds, N, currentSumMaxTotal = sumMaxTotal) => {
        if (N === 0 || currentSumMaxTotal === 0 || A === 0) return 100.0000; 
        const finalVal = 100 + ((Ds * currentSumMaxTotal) / (N * A));
        return calcTo4(finalVal); 
      };

      const score_station = calculateYourFormula(sumMaxStation, stat.raw_station_deduction, stat.total_bikes);
      const score_appearance = calculateYourFormula(sumMaxAppearance, stat.raw_appearance_deduction, stat.total_bikes);
      const score_function = calculateYourFormula(sumMaxFunction, stat.raw_function_deduction, stat.total_bikes);
      
      const score_2_0_appearance = calculateYourFormula(sumMaxAppearance, stat.raw_appearance_deduction_2_0, count_2_0);
      const score_2_0_function = calculateYourFormula(sumMaxFunction, stat.raw_function_deduction_2_0, count_2_0);
      const score_2_0e_appearance = calculateYourFormula(sumMaxAppearance, stat.raw_appearance_deduction_2_0e, count_2_0e);
      const score_2_0e_function = calculateYourFormula(sumMaxFunction, stat.raw_function_deduction_2_0e, count_2_0e);

      let availability_rate_calc = 100.0000;
      if (stat.total_docked_bikes > 0) availability_rate_calc = calcTo4(((stat.total_docked_bikes - stat.unrentable_bikes) / stat.total_docked_bikes) * 100);

      let availability_penalty = 0;
      if (availability_rate_calc < 91) availability_penalty = -5;
      else if (availability_rate_calc >= 91 && availability_rate_calc < 93) availability_penalty = -4;
      else if (availability_rate_calc >= 93 && availability_rate_calc < 95) availability_penalty = -3;
      else if (availability_rate_calc >= 95 && availability_rate_calc < 97) availability_penalty = -2;
      else if (availability_rate_calc >= 97 && availability_rate_calc < 99) availability_penalty = -1;

      const md = manualDataMap[groupName] || {};
      const t_fleet = md.total_fleet_bikes || 0;
      const t_accident = md.accident_bikes || 0;
      const t_broken = md.broken_bikes || 0; 
      const m_records = md.maintenance_records || 0;

      let maintenance_rate = 0;
      let maintenance_penalty = 0;
      const valid_bikes = t_fleet - t_accident - t_broken;
      
      if (valid_bikes > 0) maintenance_rate = calcTo4((m_records / valid_bikes) * 100);
      
      if (t_fleet > 0) {
        if (maintenance_rate < 70) maintenance_penalty = -5;
        else if (maintenance_rate >= 70 && maintenance_rate < 75) maintenance_penalty = -4;
        else if (maintenance_rate >= 75 && maintenance_rate < 80) maintenance_penalty = -3;
        else if (maintenance_rate >= 80 && maintenance_rate < 85) maintenance_penalty = -2;
        else if (maintenance_rate >= 85 && maintenance_rate < 90) maintenance_penalty = -1;
      }

      let score_2_0 = 100.0000;
      if (count_2_0 > 0) score_2_0 = calcTo4(100 + (stat.deduction_2_0 / count_2_0));
      let score_2_0e = 100.0000;
      if (count_2_0e > 0) score_2_0e = calcTo4(100 + (stat.deduction_2_0e / count_2_0e));

      let score_total_base = 100.0000;
      if (stat.total_bikes > 0) score_total_base = calcTo4(100 + (stat.deduction_total / stat.total_bikes));
      
      let final_score = calcTo4(score_total_base + availability_penalty + maintenance_penalty);

      let ops_final_score = null;
      if (opsStat.total_bikes > 0) {
        const ops_base = calcTo4(100 + (opsStat.deduction_total / opsStat.total_bikes));
        ops_final_score = calcTo4(ops_base + availability_penalty + maintenance_penalty);
      }

      nat.tested_stations += stat.unique_stations.size;
      nat.total_bikes += stat.total_bikes;
      nat.bikes_2_0_count += count_2_0;
      nat.ebikes_count += stat.ebikes_count;
      nat.tire_fail_count += stat.tire_fail_count;
      nat.raw_station_deduction += stat.raw_station_deduction;
      nat.raw_appearance_deduction += stat.raw_appearance_deduction;
      nat.raw_function_deduction += stat.raw_function_deduction;
      nat.raw_appearance_deduction_2_0 += stat.raw_appearance_deduction_2_0;
      nat.raw_function_deduction_2_0 += stat.raw_function_deduction_2_0;
      nat.raw_appearance_deduction_2_0e += stat.raw_appearance_deduction_2_0e;
      nat.raw_function_deduction_2_0e += stat.raw_function_deduction_2_0e;
      nat.deduction_total += stat.deduction_total;
      nat.deduction_2_0 += stat.deduction_2_0;
      nat.deduction_2_0e += stat.deduction_2_0e;
      nat.inspection_count += stat.inspection_count;
      nat.total_docked_bikes += stat.total_docked_bikes;
      nat.unrentable_bikes += stat.unrentable_bikes;
      nat.anomalies_2_0 += (stat.anomalies_2_0 || 0);
      nat.anomalies_2_0e += (stat.anomalies_2_0e || 0);
      nat.total_fleet_bikes += t_fleet;
      nat.accident_bikes += t_accident;
      nat.broken_bikes += t_broken;
      nat.maintenance_records += m_records;

      await db.query(`
        INSERT INTO city_monthly_scores 
        (report_month, city, tested_stations, total_bikes, bikes_2_0_count, ebikes_count, tire_fail_count, tire_fail_rate, 
         pure_station, pure_appearance, pure_function, maintenance_rate, availability_rate, final_score,
         inspection_count, total_docked_bikes, unrentable_bikes, availability_rate_calc, availability_penalty,
         total_fleet_bikes, accident_bikes, broken_bikes, maintenance_records, maintenance_penalty,
         score_2_0, score_2_0e, score_2_0_appearance, score_2_0_function, score_2_0e_appearance, score_2_0e_function, ops_final_score,
         anomalies_2_0, anomalies_2_0e)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        month, groupName, stat.unique_stations.size, stat.total_bikes, count_2_0, stat.ebikes_count, stat.tire_fail_count, tireFailRate.toFixed(2), 
        score_station.toFixed(2), score_appearance.toFixed(2), score_function.toFixed(2), maintenance_rate.toFixed(2), availability_rate_calc.toFixed(2), final_score.toFixed(2),
        stat.inspection_count, stat.total_docked_bikes, stat.unrentable_bikes, availability_rate_calc.toFixed(2), availability_penalty,
        t_fleet, t_accident, t_broken, m_records, maintenance_penalty,
        score_2_0.toFixed(2), score_2_0e.toFixed(2), score_2_0_appearance.toFixed(2), score_2_0_function.toFixed(2), score_2_0e_appearance.toFixed(2), score_2_0e_function.toFixed(2),
        ops_final_score !== null ? ops_final_score.toFixed(2) : null, stat.anomalies_2_0 || 0, stat.anomalies_2_0e || 0
      ]);
    }

    // 6. 計算全國「總計」數據並寫入資料庫
    const calculateYourFormulaNat = (A, Ds, N) => {
      if (N === 0 || sumMaxTotal === 0 || A === 0) return 100.0000; 
      const weight = calcTo4((A / sumMaxTotal) * 100);
      const finalVal = calcTo4((((weight * N) + Ds) / N / weight) * 100); 
      return finalVal;
    };

    const nat_tireFailRate = nat.total_bikes > 0 ? calcTo4((nat.tire_fail_count / nat.total_bikes) * 100) : 0;
    const n_score_station = calculateYourFormulaNat(sumMaxStation, nat.raw_station_deduction, nat.total_bikes);
    const n_score_appearance = calculateYourFormulaNat(sumMaxAppearance, nat.raw_appearance_deduction, nat.total_bikes);
    const n_score_function = calculateYourFormulaNat(sumMaxFunction, nat.raw_function_deduction, nat.total_bikes);
    const n_score_2_0_app = calculateYourFormulaNat(sumMaxAppearance, nat.raw_appearance_deduction_2_0, nat.bikes_2_0_count);
    const n_score_2_0_func = calculateYourFormulaNat(sumMaxFunction, nat.raw_function_deduction_2_0, nat.bikes_2_0_count);
    const n_score_2_0e_app = calculateYourFormulaNat(sumMaxAppearance, nat.raw_appearance_deduction_2_0e, nat.ebikes_count);
    const n_score_2_0e_func = calculateYourFormulaNat(sumMaxFunction, nat.raw_function_deduction_2_0e, nat.ebikes_count);

    let n_avail_rate = 100.0000;
    if (nat.total_docked_bikes > 0) n_avail_rate = calcTo4(((nat.total_docked_bikes - nat.unrentable_bikes) / nat.total_docked_bikes) * 100);
    let n_avail_penalty = 0;
    if (n_avail_rate < 91) n_avail_penalty = -5;
    else if (n_avail_rate >= 91 && n_avail_rate < 93) n_avail_penalty = -4;
    else if (n_avail_rate >= 93 && n_avail_rate < 95) n_avail_penalty = -3;
    else if (n_avail_rate >= 95 && n_avail_rate < 97) n_avail_penalty = -2;
    else if (n_avail_rate >= 97 && n_avail_rate < 99) n_avail_penalty = -1;

    let n_maint_rate = 0, n_maint_penalty = 0;
    const n_valid_bikes = nat.total_fleet_bikes - nat.accident_bikes - nat.broken_bikes;
    if (n_valid_bikes > 0) n_maint_rate = calcTo4((nat.maintenance_records / n_valid_bikes) * 100);
    
    if (nat.total_fleet_bikes > 0) {
      if (n_maint_rate < 70) n_maint_penalty = -5;
      else if (n_maint_rate >= 70 && n_maint_rate < 75) n_maint_penalty = -4;
      else if (n_maint_rate >= 75 && n_maint_rate < 80) n_maint_penalty = -3;
      else if (n_maint_rate >= 80 && n_maint_rate < 85) n_maint_penalty = -2;
      else if (n_maint_rate >= 85 && n_maint_rate < 90) n_maint_penalty = -1;
    }

    let n_score_2_0 = 100.0000;
    if (nat.bikes_2_0_count > 0) n_score_2_0 = calcTo4(100 + (nat.deduction_2_0 / nat.bikes_2_0_count));
    let n_score_2_0e = 100.0000;
    if (nat.ebikes_count > 0) n_score_2_0e = calcTo4(100 + (nat.deduction_2_0e / nat.ebikes_count));

    let n_score_total_base = 100.0000;
    if (nat.total_bikes > 0) n_score_total_base = calcTo4(100 + (nat.deduction_total / nat.total_bikes));
    
    let n_final_score = calcTo4(n_score_total_base + n_avail_penalty + n_maint_penalty);

    await db.query(`
      INSERT INTO city_monthly_scores 
      (report_month, city, tested_stations, total_bikes, bikes_2_0_count, ebikes_count, tire_fail_count, tire_fail_rate, 
       pure_station, pure_appearance, pure_function, maintenance_rate, availability_rate, final_score,
       inspection_count, total_docked_bikes, unrentable_bikes, availability_rate_calc, availability_penalty,
       total_fleet_bikes, accident_bikes, broken_bikes, maintenance_records, maintenance_penalty,
       score_2_0, score_2_0e, score_2_0_appearance, score_2_0_function, score_2_0e_appearance, score_2_0e_function, ops_final_score, anomalies_2_0, anomalies_2_0e)
      VALUES (?, '總計', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `, [
      month, nat.tested_stations, nat.total_bikes, nat.bikes_2_0_count, nat.ebikes_count, nat.tire_fail_count, nat_tireFailRate.toFixed(2),
      n_score_station.toFixed(2), n_score_appearance.toFixed(2), n_score_function.toFixed(2), n_maint_rate.toFixed(2), n_avail_rate.toFixed(2), n_final_score.toFixed(2),
      nat.inspection_count, nat.total_docked_bikes, nat.unrentable_bikes, n_avail_rate.toFixed(2), n_avail_penalty,
      nat.total_fleet_bikes, nat.accident_bikes, nat.broken_bikes, nat.maintenance_records, n_maint_penalty,
      n_score_2_0.toFixed(2), n_score_2_0e.toFixed(2), n_score_2_0_app.toFixed(2), n_score_2_0_func.toFixed(2), n_score_2_0e_app.toFixed(2), n_score_2_0e_func.toFixed(2),
      nat.anomalies_2_0, nat.anomalies_2_0e
    ]);
    
    // 7. 計算營運區(大區)加權平均總分
    const [scoresForGroup] = await db.query(`
      SELECT c.city, c.final_score, c.total_bikes, rg.merge_group 
      FROM city_monthly_scores c
      LEFT JOIN report_groups rg ON c.city = rg.name
      WHERE c.report_month = ? AND c.city != '總計'
    `, [month]);

    const groupCalc = {};
    scoresForGroup.forEach(row => {
      const mg = row.merge_group || row.city; 
      if (!groupCalc[mg]) groupCalc[mg] = { totalWeight: 0, totalBikes: 0 };
      if (row.total_bikes > 0 && row.final_score !== null) {
        groupCalc[mg].totalWeight += calcTo4(parseFloat(row.final_score) * parseInt(row.total_bikes));
        groupCalc[mg].totalBikes += parseInt(row.total_bikes);
      }
    });

    for (const row of scoresForGroup) {
      const mg = row.merge_group || row.city;
      const calc = groupCalc[mg];
      const groupScore = calc.totalBikes > 0 ? (calc.totalWeight / calc.totalBikes).toFixed(2) : null;
      await db.query(`
        UPDATE city_monthly_scores SET group_final_score = ? WHERE report_month = ? AND city = ?
      `, [groupScore, month, row.city]);
    }

    console.log(`[排程結束] ${month} 月份大區結算與缺失統計完成！`);
  } catch (error) {
    console.error(`[排程錯誤] 計算失敗:`, error);
    throw error;
  }
};

// ============================================================================
// API 路由區塊
// ============================================================================

router.post('/cron-daily-calculate', async (req, res) => {
  const d = new Date();
  const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  try {
    await calculateMonthlyScores(currentMonth);
    res.json({ success: true, message: `${currentMonth} 排程結算成功` });
  } catch (error) {
    res.status(500).json({ success: false, message: '排程結算發生錯誤' });
  }
});

router.get('/summary', async (req, res) => {
  const { month } = req.query; 
  try {
    const [rows] = await db.query(`
      SELECT c.*, rg.merge_group 
      FROM city_monthly_scores c
      LEFT JOIN report_groups rg ON c.city = rg.name
      WHERE c.report_month = ?
      ORDER BY IF(c.city='總計', 9999, rg.id) ASC
    `, [month]);

    const [statusRows] = await db.query(`SELECT status FROM monthly_reports WHERE report_month = ?`, [month]);
    const status = statusRows.length > 0 ? statusRows[0].status : 'draft';

    res.json({ success: true, data: rows, status: status });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

router.post('/recalculate', async (req, res) => {
  const { month } = req.body;
  if (!month) return res.status(400).json({ success: false, message: '缺少月份' });
  try {
    await calculateMonthlyScores(month);
    res.json({ success: true, message: '重新計算完成' });
  } catch (error) {
    res.status(500).json({ success: false, message: '計算發生錯誤，請檢查資料庫欄位' });
  }
});

router.put('/maintenance', async (req, res) => {
  const { month, city, field, value } = req.body;
  try {
    await db.query(`UPDATE city_monthly_scores SET ?? = ? WHERE report_month = ? AND city = ?`, [field, value, month, city]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

router.get('/months', async (req, res) => {
  const { role_level } = req.query;
  try {
    let sql = `SELECT DISTINCT report_month FROM monthly_reports WHERE 1=1 `;
    if (!role_level || parseInt(role_level) < 90) sql += ` AND status = 'published' `;
    sql += ` ORDER BY report_month DESC`;
    const [rows] = await db.query(sql);
    res.json({ success: true, data: rows.map(r => r.report_month) });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// 缺失統計表 API：直接從資料庫讀取已算好的結果
router.get('/city-issues', async (req, res) => {
  const { month, city } = req.query; 
  if (!month || !city) return res.status(400).json({ success: false, message: '缺少參數' });

  try {
    // 🌟 1. 核心查詢：直接 JOIN 剛剛建的統計表與計分規則表
    const sql = `
      SELECT 
        r.major_category, r.sub_category, r.item_name, r.bike_type, r.severity,
        s.fail_count, s.fail_rate
      FROM scoring_rules r
      LEFT JOIN city_issue_stats s ON r.item_key = s.item_key 
        AND s.report_month = ? AND s.city = ?
      WHERE r.is_active = 1
      ORDER BY r.major_category, r.id
    `;
    const [rows] = await db.query(sql, [month, city]);

    // 🌟 2. 準備回傳給前端的格式 (A, B, C 分級)
    const resultData = { A: [], B: [], C: [], summary: { totalStations: 0, totalBikes: 0, ebikesCount: 0 } };

    // (選擇性) 如果你需要 summary 的總車數，可以再去 city_monthly_scores 抓一筆配給它
    const [[summaryRow]] = await db.query(`SELECT tested_stations, total_bikes, ebikes_count FROM city_monthly_scores WHERE report_month = ? AND city = ?`, [month, city]);
    if (summaryRow) {
      resultData.summary = { totalStations: summaryRow.tested_stations, totalBikes: summaryRow.total_bikes, ebikesCount: summaryRow.ebikes_count };
    }

    // 🌟 3. 將撈出來的現成資料分類塞入陣列
    rows.forEach(row => {
      const itemData = {
        major_category: row.major_category, 
        sub_category: row.sub_category || '',
        item_name: row.item_name, 
        bike_type: row.bike_type || 'ALL', 
        fail_count: row.fail_count || 0, 
        
        // 🌟 把原本的 fail_rate: parseFloat(row.fail_rate || 0) 改成下面這樣：
        fail_rate: Math.round(parseFloat(row.fail_rate || 0))
      };
      
      if (row.severity === 'A' || row.severity === '重大問題') resultData.A.push(itemData);
      else if (row.severity === 'B' || row.severity === '重點問題') resultData.B.push(itemData);
      else resultData.C.push(itemData); 
    });

    res.json({ success: true, data: resultData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

router.get('/cities', async (req, res) => {
  const { user_id, role_level } = req.query;
  try {
    let sql = `SELECT id, name FROM report_groups WHERE status = 'ACTIVE' `;
    let params = [];
    if (!role_level || parseInt(role_level) < 90) {
      sql += ` AND id IN (SELECT report_group_id FROM user_view_regions WHERE user_id = ?)`;
      params.push(user_id);
    }
    sql += ` ORDER BY id ASC`;
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows.map(r => r.name) });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;