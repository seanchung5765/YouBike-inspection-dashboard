import * as XLSX from 'xlsx-js-style'
import { ElMessage, ElLoading } from 'element-plus'
import { getReportSummaryAPI, getCityIssuesAPI, getReportCitiesAPI } from '../api/report'

const getPreviousMonth = (month) => {
  if (!month) return '';
  const d = new Date(`${month}-01`);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ==========================================
// 🎨 共用樣式定義產生器與格式化工具
// ==========================================
const getBaseStyle = (fontSize = 16) => ({
  font: { name: "Arial", sz: fontSize }, 
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: "thin", color: { auto: 1 } },
    bottom: { style: "thin", color: { auto: 1 } },
    left: { style: "thin", color: { auto: 1 } },
    right: { style: "thin", color: { auto: 1 } }
  }
});

// 🌟 千分號格式化函數
const formatNumber = (num) => {
  if (num === '-' || num === null || num === undefined || num === '') return '-';
  const n = Number(num);
  return isNaN(n) ? num : n.toLocaleString('en-US');
};

const buildGroupMerges = (rowIndex, dataSummary, headers) => {
  const rowMerges = [];
  let startC = 1; 
  const getVal = (dataArr, city, key) => {
    const row = dataArr.find(r => r.city === city);
    return row && row[key] !== null && row[key] !== undefined ? row[key] : '-';
  };
  
  for (let i = 1; i <= headers.length; i++) {
    const currentCity = headers[i - 1];
    const nextCity = i < headers.length ? headers[i] : null;
    const currentVal = getVal(dataSummary, currentCity, 'group_final_score');
    const nextVal = nextCity ? getVal(dataSummary, nextCity, 'group_final_score') : null;
    if (currentVal !== nextVal) {
       if (i > startC && currentVal !== '-' && currentVal !== null) { 
         rowMerges.push({ s: { r: rowIndex, c: startC }, e: { r: rowIndex, c: i } });
       }
       startC = i + 1;
    }
  }
  return rowMerges;
};

export const exportMonthlyReportToExcel = async (month) => {
  const loadingInstance = ElLoading.service({
    lock: true,
    text: `正在分析多月份數據並產生綜合報表...`,
    background: 'rgba(0, 0, 0, 0.7)',
  });

  try {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    
    // 🌟 產生 5 個月的陣列 (0:當月, 1:前一月, 2:前兩月, 3:前三月, 4:前四月)
    const monthsToFetch = [month];
    for(let i = 0; i < 4; i++) {
        monthsToFetch.push(getPreviousMonth(monthsToFetch[i]));
    }
    const [m0, m1, m2, m3, m4] = monthsToFetch;

    const [currRes, prevRes, citiesRes] = await Promise.all([
      getReportSummaryAPI(m0, currentUser.id, currentUser.role_level),
      getReportSummaryAPI(m1, currentUser.id, currentUser.role_level),
      getReportCitiesAPI(currentUser.id, currentUser.role_level)
    ]);

    const currSummary = currRes.data.success ? currRes.data.data : [];
    const prevSummary = prevRes.data.success ? prevRes.data.data : [];
    const allowedCities = citiesRes.data.success ? citiesRes.data.data : []; 

    if (currSummary.length === 0) {
      ElMessage.warning(`[${month}] 尚未有結算資料可供匯出`);
      loadingInstance.close();
      return;
    }

    // 🌟 拆分兩種縣市清單：
    // 1. 全域清單 (用來產生前 4 張不受權限限制的總表)
    const allCityHeaders = currSummary
      .filter(r => r.city !== '總計')
      .map(r => r.city);

    // 2. 授權清單 (用來決定要產生哪些細部明細表)
    const allowedCityHeaders = allCityHeaders.filter(c => allowedCities.includes(c));

    if (allCityHeaders.length === 0) {
      ElMessage.error('查無任何縣市資料，無法匯出報表。');
      loadingInstance.close();
      return;
    }

    // 🌟 併發拉取 5 個月內「所有」縣市的缺失明細
    const allIssues = {};
    allCityHeaders.forEach(c => allIssues[c] = {});
    
    const issuePromises = [];
    for (let c of allCityHeaders) {
      for (let m of monthsToFetch) {
        issuePromises.push(
          getCityIssuesAPI(m, c, currentUser.id).then(res => {
            allIssues[c][m] = res && res.data && res.data.success ? res.data.data : null;
          }).catch(() => { allIssues[c][m] = null; })
        );
      }
    }
    await Promise.all(issuePromises);

    const wb = XLSX.utils.book_new();

    // ==========================================
    // 資料格式化小幫手
    // ==========================================
    const getVal = (dataArr, city, key) => {
      const row = dataArr.find(r => r.city === city);
      return row && row[key] !== null && row[key] !== undefined ? row[key] : '-';
    };
    // 🌟 支援千分號的取值小幫手
    const getCommaVal = (dataArr, city, key) => formatNumber(getVal(dataArr, city, key));
    const getUnitVal = (dataArr, city, key, unit) => {
      const val = getVal(dataArr, city, key);
      return val !== '-' ? `${formatNumber(val)}${unit}` : '-';
    };
    const getRoundedVal = (dataArr, city, key) => {
      const val = getVal(dataArr, city, key);
      return val !== '-' ? Math.round(parseFloat(val)) : '-';
    };
    const getFixedRateVal1 = (dataArr, city, key) => {
      const val = getVal(dataArr, city, key);
      return val !== '-' ? `${parseFloat(val).toFixed(1)}%` : '-';
    };

    // ==========================================
    // 📝 Sheet 1: 成績與主管自評 (不分權限全顯示)
    // ==========================================
    const summaryTitle = m0.replace('-', '/'); 
    
    const summaryAoA = [
      [summaryTitle, ...allCityHeaders, '總計/平均值'],
      ['施測站數', ...allCityHeaders.map(c => getCommaVal(currSummary, c, 'tested_stations')), getCommaVal(currSummary, '總計', 'tested_stations')],
      ['施測車輛數', ...allCityHeaders.map(c => getCommaVal(currSummary, c, 'total_bikes')), getCommaVal(currSummary, '總計', 'total_bikes')],
      ['2.0E施測車輛數', ...allCityHeaders.map(c => getCommaVal(currSummary, c, 'ebikes_count')), getCommaVal(currSummary, '總計', 'ebikes_count')],
      ['前後胎壓未達標準 (輛)', ...allCityHeaders.map(c => getUnitVal(currSummary, c, 'tire_fail_count', '輛')), getUnitVal(currSummary, '總計', 'tire_fail_count', '輛')],
      ['前後胎壓未達標準 (%)', ...allCityHeaders.map(c => getFixedRateVal1(currSummary, c, 'tire_fail_rate')), getFixedRateVal1(currSummary, '總計', 'tire_fail_rate')],
      ['場站妥善度', ...allCityHeaders.map(c => getRoundedVal(currSummary, c, 'pure_station')), getRoundedVal(currSummary, '總計', 'pure_station')],
      ['自行車外觀與重要標示', ...allCityHeaders.map(c => getRoundedVal(currSummary, c, 'pure_appearance')), getRoundedVal(currSummary, '總計', 'pure_appearance')],
      ['自行車重要機能', ...allCityHeaders.map(c => getRoundedVal(currSummary, c, 'pure_function')), getRoundedVal(currSummary, '總計', 'pure_function')],
      ['一級維護率(EMS紀錄)', ...allCityHeaders.map(c => getFixedRateVal1(currSummary, c, 'maintenance_rate')), getFixedRateVal1(currSummary, '總計', 'maintenance_rate')],
      ['可動率', ...allCityHeaders.map(c => getFixedRateVal1(currSummary, c, 'availability_rate')), getFixedRateVal1(currSummary, '總計', 'availability_rate')],
      [`${m0}`, ...allCityHeaders.map(c => getVal(currSummary, c, 'final_score')), getVal(currSummary, '總計', 'final_score')],
      ['', ...allCityHeaders.map(c => getVal(currSummary, c, 'group_final_score')), ''], 
      [`${m1}`, ...allCityHeaders.map(c => getVal(prevSummary, c, 'final_score')), getVal(prevSummary, '總計', 'final_score')],
      ['', ...allCityHeaders.map(c => getVal(prevSummary, c, 'group_final_score')), ''], 
      ['營運測評', ...allCityHeaders.map(c => getVal(currSummary, c, 'ops_final_score')), '-']
    ];
    
    const targetColIdx = allCityHeaders.length + 3; 
    while(summaryAoA[11].length <= targetColIdx + 1) summaryAoA[11].push('');
    while(summaryAoA[15].length <= targetColIdx + 1) summaryAoA[15].push('');
    summaryAoA[11][targetColIdx] = '低於92分';
    summaryAoA[15][targetColIdx] = '高出施測分數5分以上';

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA);
    // 🌟 幫第一頁右側的警示框配置更寬的欄位寬度 (25)
    const summaryColWidths = [30, ...allCityHeaders.map(() => 16), 22, 5, 25, 25];
    wsSummary['!cols'] = summaryColWidths.map(w => ({ wch: w }));
    
    wsSummary['!merges'] = [
      { s: { r: 11, c: 0 }, e: { r: 12, c: 0 } }, 
      { s: { r: 13, c: 0 }, e: { r: 14, c: 0 } }, 
      { s: { r: 11, c: allCityHeaders.length + 1 }, e: { r: 12, c: allCityHeaders.length + 1 } }, 
      { s: { r: 13, c: allCityHeaders.length + 1 }, e: { r: 14, c: allCityHeaders.length + 1 } }, 
      { s: { r: 11, c: targetColIdx }, e: { r: 11, c: targetColIdx + 1 } }, 
      { s: { r: 15, c: targetColIdx }, e: { r: 15, c: targetColIdx + 1 } }, 
      ...buildGroupMerges(12, currSummary, allCityHeaders), 
      ...buildGroupMerges(14, prevSummary, allCityHeaders)  
    ];

    for(let r = 0; r < summaryAoA.length; r++) {
      for(let c = 0; c < summaryAoA[r].length; c++) {
        const cellRef = XLSX.utils.encode_cell({r, c});
        if(!wsSummary[cellRef]) continue;
        let s = getBaseStyle(16);

        if (r === 0) {
          s.font.bold = true;
          if (c > 0 && c <= allCityHeaders.length + 1) s.fill = { fgColor: { rgb: "FDE9D9" } };
        }
        if (r === 5 && c > 0 && c <= allCityHeaders.length) s.font.color = { rgb: "FF0000" };
        if (r === 5) s.border.bottom = { style: "medium", color: { rgb: "FF0000" } };
        if (r === 6) s.border.top = { style: "medium", color: { rgb: "FF0000" } };
        if (r === 8) s.border.bottom = { style: "medium", color: { rgb: "FF0000" } };
        if (r === 9) s.border.top = { style: "medium", color: { rgb: "FF0000" } };

        if (r >= 6 && r <= 8 && c > 0 && c <= allCityHeaders.length) {
          const val = parseFloat(wsSummary[cellRef].v);
          const avgVal = parseFloat(summaryAoA[r][allCityHeaders.length + 1]);
          if (!isNaN(val) && !isNaN(avgVal) && val < avgVal) {
            s.font.color = { rgb: "FF0000" };
            s.fill = { fgColor: { rgb: "CCC0DA" } };
          }
        }
        if ((r === 9 || r === 10) && c > 0 && c <= allCityHeaders.length) {
          const val = parseFloat(String(wsSummary[cellRef].v).replace('%', ''));
          const threshold = r === 9 ? 90 : 99;
          if (!isNaN(val) && val < threshold) {
            s.font.color = { rgb: "FF0000" };
            s.fill = { fgColor: { rgb: "CCC0DA" } };
          }
        }
        if (r >= 11 && r <= 14) {
          if (c <= allCityHeaders.length + 1) {
            s.font.bold = true;
            if (c > 0 && c <= allCityHeaders.length) {
              if (r === 11 || r === 13) {
                const val = parseFloat(wsSummary[cellRef].v);
                if (!isNaN(val) && val < 92) {
                  s.fill = { fgColor: { rgb: "FFFF00" } };
                  s.font.color = { rgb: "FF0000" };
                }
              }
            }
            if (r === 11) s.border.top = { style: "thick", color: { rgb: "000000" } };
            if (r === 12) s.border.bottom = { style: "thick", color: { rgb: "000000" } };
            if (r === 13) s.border.top = { style: "thick", color: { rgb: "000000" } };
            if (r === 14) s.border.bottom = { style: "thick", color: { rgb: "000000" } };
          }
        }
        if (r === 15 && c > 0 && c <= allCityHeaders.length) {
          s.fill = { fgColor: { rgb: "FCD5B4" } };
          const opsScore = parseFloat(wsSummary[cellRef].v);
          const finalScore = parseFloat(summaryAoA[11][c]); 
          if (!isNaN(opsScore) && !isNaN(finalScore) && opsScore >= finalScore + 5) {
            s.font.color = { rgb: "FF0000" };
          }
        }

        if (r === 11 && (c === targetColIdx || c === targetColIdx + 1)) {
           s.fill = { fgColor: { rgb: "FFFF00" } };
           s.font.color = { rgb: "FF0000" };
           s.font.bold = true;
           s.border = { top: { style: "thick", color: { rgb: "000000" } }, bottom: { style: "thick", color: { rgb: "000000" } }, left: { style: "thick", color: { rgb: "000000" } }, right: { style: "thick", color: { rgb: "000000" } } };
        }
        if (r === 15 && (c === targetColIdx || c === targetColIdx + 1)) {
           s.fill = { fgColor: { rgb: "FCD5B4" } };
           s.font.color = { rgb: "FF0000" };
           s.font.bold = true;
           s.border = { top: { style: "thick", color: { rgb: "000000" } }, bottom: { style: "thick", color: { rgb: "000000" } }, left: { style: "thick", color: { rgb: "000000" } }, right: { style: "thick", color: { rgb: "000000" } } };
        }

        if ((r === 11 || r === 13) && c === 0) s.font.sz = 22;
        wsSummary[cellRef].s = s;
      }
    }
    XLSX.utils.book_append_sheet(wb, wsSummary, "成績與主管自評");

    // ==========================================
    // 📝 Sheet 2: 可動率
    // ==========================================
    const availAoA = [
      [m0, ...allCityHeaders, '總計'],
      ['抽驗場站數', ...allCityHeaders.map(c => getCommaVal(currSummary, c, 'tested_stations')), getCommaVal(currSummary, '總計', 'tested_stations')],
      ['抽驗總在站車輛數', ...allCityHeaders.map(c => getCommaVal(currSummary, c, 'total_docked_bikes')), getCommaVal(currSummary, '總計', 'total_docked_bikes')],
      ['無法租借車輛數', ...allCityHeaders.map(c => getCommaVal(currSummary, c, 'unrentable_bikes')), getCommaVal(currSummary, '總計', 'unrentable_bikes')],
      ['在站車輛可動率', ...allCityHeaders.map(c => getFixedRateVal1(currSummary, c, 'availability_rate_calc')), getFixedRateVal1(currSummary, '總計', 'availability_rate_calc')],
      [], 
      [m1, ...allCityHeaders, '總計'],
      ['抽驗場站數', ...allCityHeaders.map(c => getCommaVal(prevSummary, c, 'tested_stations')), getCommaVal(prevSummary, '總計', 'tested_stations')],
      ['抽驗總在站車輛數', ...allCityHeaders.map(c => getCommaVal(prevSummary, c, 'total_docked_bikes')), getCommaVal(prevSummary, '總計', 'total_docked_bikes')],
      ['無法租借車輛數', ...allCityHeaders.map(c => getCommaVal(prevSummary, c, 'unrentable_bikes')), getCommaVal(prevSummary, '總計', 'unrentable_bikes')],
      ['在站車輛可動率', ...allCityHeaders.map(c => getFixedRateVal1(prevSummary, c, 'availability_rate_calc')), getFixedRateVal1(prevSummary, '總計', 'availability_rate_calc')]
    ];
    
    // 🌟 在第 16 列補上「可動率對照表」
    while (availAoA.length < 15) availAoA.push([]);
    const availLegendStartIdx = availAoA.length;
    availAoA.push(['可動率', '分值']);
    availAoA.push(['未達91%', '-5']);
    availAoA.push(['未達93%~91%', '-4']);
    availAoA.push(['未達95%~93%', '-3']);
    availAoA.push(['未達97%~95%', '-2']);
    availAoA.push(['未達99%~97%', '-1']);
    availAoA.push(['100%~99%', '0']);

    const standardColWidths = [30, ...allCityHeaders.map(() => 16), 22];
    const wsAvail = XLSX.utils.aoa_to_sheet(availAoA);
    wsAvail['!cols'] = standardColWidths.map(w => ({ wch: w }));
    
    for(let r = 0; r < availAoA.length; r++) {
      for(let c = 0; c < availAoA[r].length; c++) {
        const cellRef = XLSX.utils.encode_cell({r, c});
        if(!wsAvail[cellRef]) continue;
        let s = getBaseStyle(16);
        
        if (r === 0 || r === 6 || r === 2 || r === 8) s.font.bold = true;
        if (r === 4 || r === 10) {
          s.border.top = { style: "thick", color: { rgb: "000000" } };
          s.border.bottom = { style: "thick", color: { rgb: "000000" } };
          if (r === 4 && c > 0) {
            const val = parseFloat(String(wsAvail[cellRef].v).replace('%', ''));
            if (!isNaN(val) && val < 99) s.font.color = { rgb: "C00000" };
          }
        }

        // 🌟 對照表的樣式設定
        if (r >= availLegendStartIdx && r <= availLegendStartIdx + 6 && c <= 1) {
          s.border = {
            top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } }
          };
          if (r === availLegendStartIdx) { // 表頭
             s.fill = { patternType: "solid", fgColor: { rgb: "E7E6E6" } };
             s.font.bold = true;
          }
        }
        
        wsAvail[cellRef].s = s;
      }
    }
    XLSX.utils.book_append_sheet(wb, wsAvail, "可動率");

    // ==========================================
    // 📝 Sheet 3: 一級維護
    // ==========================================
    const maintAoA = [
      [m0, ...allCityHeaders, '總計'],
      ['總營運車輛數', ...allCityHeaders.map(c => getCommaVal(currSummary, c, 'total_fleet_bikes')), getCommaVal(currSummary, '總計', 'total_fleet_bikes')],
      ['事故車輛數', ...allCityHeaders.map(c => getCommaVal(currSummary, c, 'accident_bikes')), getCommaVal(currSummary, '總計', 'accident_bikes')],
      ['一級維護紀錄數', ...allCityHeaders.map(c => getCommaVal(currSummary, c, 'maintenance_records')), getCommaVal(currSummary, '總計', 'maintenance_records')],
      ['一級維護率', ...allCityHeaders.map(c => getFixedRateVal1(currSummary, c, 'maintenance_rate')), getFixedRateVal1(currSummary, '總計', 'maintenance_rate')],
      ['較上個月變動', ...allCityHeaders.map(c => {
         const diff = parseFloat(getVal(currSummary, c, 'maintenance_rate')) - parseFloat(getVal(prevSummary, c, 'maintenance_rate') || 0);
         return isNaN(diff) ? '-' : `${diff.toFixed(1)}%`;
      }), '-'],
      [], 
      [m1, ...allCityHeaders, '總計'],
      ['總營運車輛數', ...allCityHeaders.map(c => getCommaVal(prevSummary, c, 'total_fleet_bikes')), getCommaVal(prevSummary, '總計', 'total_fleet_bikes')],
      ['事故車輛數', ...allCityHeaders.map(c => getCommaVal(prevSummary, c, 'accident_bikes')), getCommaVal(prevSummary, '總計', 'accident_bikes')],
      ['一級維護紀錄數', ...allCityHeaders.map(c => getCommaVal(prevSummary, c, 'maintenance_records')), getCommaVal(prevSummary, '總計', 'maintenance_records')],
      ['一級維護率', ...allCityHeaders.map(c => getFixedRateVal1(prevSummary, c, 'maintenance_rate')), getFixedRateVal1(prevSummary, '總計', 'maintenance_rate')]
    ];
    
    // 🌟 在第 16 列補上「一級維護率對照表」
    while (maintAoA.length < 15) maintAoA.push([]);
    const maintLegendStartIdx = maintAoA.length;
    maintAoA.push(['一級維護率', '分值']);
    maintAoA.push(['未達70%', '-5']);
    maintAoA.push(['未達75%~70%', '-4']);
    maintAoA.push(['未達80%~75%', '-3']);
    maintAoA.push(['未達85%~80%', '-2']);
    maintAoA.push(['未達90%~85%', '-1']);
    maintAoA.push(['100%~90%', '0']);

    const wsMaint = XLSX.utils.aoa_to_sheet(maintAoA);
    wsMaint['!cols'] = standardColWidths.map(w => ({ wch: w }));
    for(let r = 0; r < maintAoA.length; r++) {
      for(let c = 0; c < maintAoA[r].length; c++) {
        const cellRef = XLSX.utils.encode_cell({r, c});
        if(!wsMaint[cellRef]) continue;
        let s = getBaseStyle(16);
        if (r === 0 || r === 7) s.font.bold = true;
        if (r === 4 || r === 11) {
          s.border.top = { style: "thick", color: { rgb: "000000" } };
          s.border.bottom = { style: "thick", color: { rgb: "000000" } };
          s.font.bold = true;
        }
        if (r === 5 && c > 0 && c <= allCityHeaders.length) {
          const val = parseFloat(String(wsMaint[cellRef].v).replace('%', ''));
          if (!isNaN(val)) {
            if (val < 0) s.font.color = { rgb: "FF0000" };
            else if (val > 5) s.font.color = { rgb: "00B0F0" }; 
          }
        }
        
        // 🌟 對照表的樣式設定
        if (r >= maintLegendStartIdx && r <= maintLegendStartIdx + 6 && c <= 1) {
          s.border = {
            top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } }
          };
          if (r === maintLegendStartIdx) {
             s.fill = { patternType: "solid", fgColor: { rgb: "E7E6E6" } };
             s.font.bold = true;
          }
        }

        wsMaint[cellRef].s = s;
      }
    }
    XLSX.utils.book_append_sheet(wb, wsMaint, "一級維護");

    // ==========================================
    // 🌟 Sheet 4: 問題點 (跨月份趨勢統計)
    // ==========================================
    const toDict = (data) => {
      const dict = {};
      if (!data) return dict;
      ['A', 'B', 'C'].forEach(cat => {
        (data[cat] || []).forEach(item => {
          const name = item.sub_category ? `${item.sub_category}[${item.item_name}]` : item.item_name;
          dict[name] = { count: parseInt(item.fail_count) || 0, rate: parseFloat(item.fail_rate) || 0 };
        });
      });
      return dict;
    };

    const getDiffDisplay = (curr, prev) => {
      if (!prev || prev.rate === 0 || prev.count === 0) return { text: '▲', type: 'new' };
      const diff = Math.round(curr.rate - prev.rate);
      if (diff > 0) return { text: `${diff}%`, type: 'up' };
      if (diff < 0) return { text: `${diff}%`, type: 'down' };
      return { text: '-', type: 'flat' };
    };

    const issueAoA = [];
    const m0_display = parseInt(m0.split('-')[1], 10);
    const m1_display = parseInt(m1.split('-')[1], 10);
    const m2_display = parseInt(m2.split('-')[1], 10);

    // 🌟 幫第一列右邊加上圖例文字 (放在索引 14 的位置)
    issueAoA.push([
      '地區/月份', 
      m0_display, '', '', '', 
      m1_display, '', '', '', 
      m2_display, '', '', '',
      '', '▲：當月新增問題點    文字標紅:連續三個月10% ↑'
    ]);
    issueAoA.push([
      '', 
      '檢查項目', '異常數量', '異常率', '較上個月',
      '檢查項目', '異常數量', '異常率', '較上個月',
      '檢查項目', '異常數量', '異常率', '較上個月'
    ]);
    
    const issueMerges = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, 
      { s: { r: 0, c: 1 }, e: { r: 0, c: 4 } }, 
      { s: { r: 0, c: 5 }, e: { r: 0, c: 8 } }, 
      { s: { r: 0, c: 9 }, e: { r: 0, c: 12 } },
      { s: { r: 0, c: 14 }, e: { r: 0, c: 18 } } // 🌟 圖例儲存格合併
    ];

    let rowIdx = 2;
    const allCityDicts = {}; 
    const cityColors = ["F4CCCC", "D9EAD3", "93C47D", "6AA84F", "FCE5CD", "F9CB9C", "D0E0E3", "A4C2F4", "6D9EEB", "3C78D8"];

    allCityHeaders.forEach((city, cityIndex) => {
      const d0 = toDict(allIssues[city][m0]);
      const d1 = toDict(allIssues[city][m1]);
      const d2 = toDict(allIssues[city][m2]);
      const d3 = toDict(allIssues[city][m3]);
      const d4 = toDict(allIssues[city][m4]);
      allCityDicts[city] = [d0, d1, d2, d3, d4];

      const getList = (dict) => Object.entries(dict)
        .filter(x => x[1].rate >= 10)
        .sort((a,b) => b[1].count - a[1].count)
        .slice(0, 10);

      const list0 = getList(d0);
      const list1 = getList(d1);
      const list2 = getList(d2);

      for (let r = 0; r < 10; r++) {
        const rowData = [r === 0 ? city : ''];
        
        if (r < list0.length) {
          const [name, item] = list0[r];
          const diff = getDiffDisplay(item, d1[name]);
          // 🌟 異常數量補上千分號
          rowData.push(name, formatNumber(item.count), `${Math.round(item.rate)}%`, diff.text);
        } else rowData.push('', '', '', '');

        if (r < list1.length) {
          const [name, item] = list1[r];
          const diff = getDiffDisplay(item, d2[name]);
          rowData.push(name, formatNumber(item.count), `${Math.round(item.rate)}%`, diff.text);
        } else rowData.push('', '', '', '');

        if (r < list2.length) {
          const [name, item] = list2[r];
          const diff = getDiffDisplay(item, d3[name]);
          rowData.push(name, formatNumber(item.count), `${Math.round(item.rate)}%`, diff.text);
        } else rowData.push('', '', '', '');

        issueAoA.push(rowData);
      }
      issueMerges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx + 9, c: 0 } });
      rowIdx += 10;
    });

    const wsIssue = XLSX.utils.aoa_to_sheet(issueAoA);
    wsIssue['!merges'] = issueMerges;
    // 預留更多空間給右側圖例
    wsIssue['!cols'] = [12, 45, 12, 12, 12, 45, 12, 12, 12, 45, 12, 12, 12, 5, 45].map(w => ({ wch: w }));
    wsIssue['!rows'] = [{ hpt: 40 }];

    for (const key in wsIssue) {
      if (key.startsWith('!')) continue;
      let s = getBaseStyle(12);
      const col = XLSX.utils.decode_cell(key).c;
      const row = parseInt(key.replace(/[A-Z]/g, '')) - 1; 
      const val = wsIssue[key].v;

      // 🌟 問題點圖例紅色粗體靠左對齊設定
      if ((row === 0 || row === 1) && col >= 13) {
        s.border = {}; // 右側圖例區塊不需要框線，也不要套用底色
        if (row === 0 && col === 14) {
          s.font.color = { rgb: "FF0000" };
          s.font.bold = true;
          s.alignment = { horizontal: 'left', vertical: 'center' };
        }
      } else {
        if (row >= 2 && (col === 1 || col === 5 || col === 9)) s.alignment.horizontal = 'left';

        if (row === 0 || row === 1) {
          s.font.bold = true;
          s.font.sz = 14;
          s.fill = { fgColor: { rgb: "FDE9D9" } };
          s.border.bottom = { style: "thick", color: { rgb: "000000" } };
          if (row === 0 && (col === 1 || col === 5 || col === 9)) s.font.sz = 20;
        }

        if (col === 4 || col === 8 || col === 12) {
          s.border.right = { style: "thick", color: { rgb: "000000" } };
        }

        if (row >= 2) {
          const cityIndex = Math.floor((row - 2) / 10);
          if (col === 0) {
            s.font.bold = true;
            s.font.sz = 18;
            
            const rawColor = cityColors[cityIndex % cityColors.length] || "FFFFFF";
            const safeColor = rawColor.replace('#', ''); 
            
            s.fill = { 
              patternType: "solid",
              fgColor: { rgb: safeColor } 
            };
            
            s.border.bottom = { style: "thin", color: { rgb: "000000" } };
            if ((row - 1) % 10 === 0) s.border.bottom = { style: "thick", color: { rgb: "000000" } };
          }
          
          if ((row - 1) % 10 === 0 && col < 13) {
            s.border.bottom = { style: "thick", color: { rgb: "000000" } };
          }

          const currentCity = allCityHeaders[cityIndex];
          const dicts = allCityDicts[currentCity];

          if (col === 4 || col === 8 || col === 12) {
             if (val === '▲') s.font.color = { rgb: "C00000" };
             else if (String(val).includes('-')) s.font.color = { rgb: "00B050" };
             else if (parseInt(val) > 0) s.font.color = { rgb: "C00000" };
          }

          if (col === 1 || col === 5 || col === 9) {
             const monthIdx = col === 1 ? 0 : (col === 5 ? 1 : 2);
             const dC = dicts[monthIdx];
             const dP = dicts[monthIdx + 1];
             const dPP = dicts[monthIdx + 2];
             
             if (dC[val]?.rate >= 10 && dP && dP[val]?.rate >= 10 && dPP && dPP[val]?.rate >= 10) {
                s.font.color = { rgb: "FF0000" };
             }
          }
        }
      }
      wsIssue[key].s = s;
    }
    XLSX.utils.book_append_sheet(wb, wsIssue, "問題點");


    // ==========================================
    // 🚲 Sheet 5+: 各縣市明細 (這裡嚴格控管：只產生有權限的縣市)
    // ==========================================
    const roundInt = (v) => (v !== undefined && v !== null && v !== '-') ? Math.round(parseFloat(v)) : '-';
    const round1Dec = (v) => (v !== undefined && v !== null && v !== '-') ? parseFloat(v).toFixed(1) : '-';
    const round2Dec = (v) => (v !== undefined && v !== null && v !== '-') ? parseFloat(v).toFixed(2) : '-';

    allowedCityHeaders.forEach((city) => {
      const issueRes = allIssues[city][m0];
      if (!issueRes) return;

      const { A, B, C, summary } = issueRes;
      const citySummary = currSummary.find(r => r.city === city) || {};
      
      const allFailCounts = [...A, ...B, ...C]
        .map(x => parseInt(x.fail_count))
        .filter(val => !isNaN(val) && val > 0)
        .sort((a, b) => b - a);
      const top5Threshold = allFailCounts.length >= 5 ? allFailCounts[4] : (allFailCounts[allFailCounts.length - 1] || 99999);

      const cityAoA = [];
      cityAoA.push(['施測總數', summary.totalBikes, '輛車', '', '', '橘底：全項目件數前５項', '紅底紅字：異常率>2０％', '', '', '', '', '', '', '', '']);
      cityAoA.push(['2.0施測數量', summary.totalBikes - summary.ebikesCount, '2.0E施測數量', summary.ebikesCount, '', '', '', '', '', '', '', '', '', '', '']);
      cityAoA.push([]); 
      
      cityAoA.push([
        '重大問題(安全) A級', '', '', '', '', 
        '重點問題(觀感) B級', '', '', '', '', 
        '一般問題(內部管理) C級', '', '', '', ''
      ]);
      cityAoA.push([
        '分類', '缺失項目', '', '異常件數', '異常率', 
        '分類', '缺失項目', '', '異常件數', '異常率', 
        '分類', '缺失項目', '', '異常件數', '異常率'
      ]);

      const maxLen = Math.max(A.length, B.length, C.length);
      const formatItemName = (row) => {
        if (!row.item_name) return '';
        return row.sub_category ? `${row.sub_category}[${row.item_name}]` : row.item_name;
      };

      for (let i = 0; i < maxLen; i++) {
        const rowA = A[i] || { major_category: '', sub_category: '', item_name: '', fail_count: '', fail_rate: '' };
        const rowB = B[i] || { major_category: '', sub_category: '', item_name: '', fail_count: '', fail_rate: '' };
        const rowC = C[i] || { major_category: '', sub_category: '', item_name: '', fail_count: '', fail_rate: '' };
        
        cityAoA.push([
          rowA.major_category, formatItemName(rowA), '', rowA.fail_count, rowA.fail_rate !== '' ? rowA.fail_rate + '%' : '',
          rowB.major_category, formatItemName(rowB), '', rowB.fail_count, rowB.fail_rate !== '' ? rowB.fail_rate + '%' : '',
          rowC.major_category, formatItemName(rowC), '', rowC.fail_count, rowC.fail_rate !== '' ? rowC.fail_rate + '%' : ''
        ]);
      }

      cityAoA.push([]); 
      cityAoA.push(['自行車類別', '模擬體驗類別', '', '類別分數', '總分', '異常數量', '可動率', '可動率扣分', '', '', '', '', '', '', '']);
      cityAoA.push(['', '場站', '', roundInt(citySummary.pure_station), '', '', `${citySummary.availability_rate_calc}%`, citySummary.availability_penalty, '', '', '', '', '', '', '']);
      cityAoA.push(['2.0', '自行車外觀與重要標示', '', roundInt(citySummary.score_2_0_appearance), round1Dec(citySummary.score_2_0), citySummary.anomalies_2_0, '一級維護率', '維護率扣分', '', '', '', '', '', '', '']);
      cityAoA.push(['', '自行車重要機能', '', roundInt(citySummary.score_2_0_function), '', '', `${citySummary.maintenance_rate}%`, citySummary.maintenance_penalty, '', '', '', '', '', '', '']);
      cityAoA.push(['2.0E', '自行車外觀與重要標示', '', roundInt(citySummary.score_2_0e_appearance), round1Dec(citySummary.score_2_0e), citySummary.anomalies_2_0e, '模擬體驗總分', round2Dec(citySummary.final_score), '', '', '', '', '', '', '']);
      cityAoA.push(['', '自行車重要機能', '', roundInt(citySummary.score_2_0e_function), '', '', '', '', '', '', '', '', '', '', '']);

      const wsCity = XLSX.utils.aoa_to_sheet(cityAoA);
      
      wsCity['!merges'] = [
        { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } }, 
        { s: { r: 3, c: 5 }, e: { r: 3, c: 9 } }, 
        { s: { r: 3, c: 10 }, e: { r: 3, c: 14 } } 
      ];
      const listEndRow = 4 + maxLen; 
      for(let r = 4; r <= listEndRow; r++) { 
          wsCity['!merges'].push({ s: {r, c: 1}, e: {r, c: 2} }); 
          wsCity['!merges'].push({ s: {r, c: 6}, e: {r, c: 7} }); 
          wsCity['!merges'].push({ s: {r, c: 11}, e: {r, c: 12} }); 
      }
      const footerStart = listEndRow + 2; 
      for(let r = footerStart; r < footerStart + 6; r++) {
          wsCity['!merges'].push({ s: {r, c: 1}, e: {r, c: 2} });
      }

      wsCity['!cols'] = [23, 28, 28, 12, 10, 25, 28, 28, 10, 10, 23, 28, 28, 10, 10].map(w => ({ wch: w }));

      for (const key in wsCity) {
        if (key.startsWith('!')) continue;
        let s = getBaseStyle(12); 
        const colIdx = XLSX.utils.decode_cell(key).c;
        const row = parseInt(key.replace(/[A-Z]/g, '')) - 1; 
        const val = wsCity[key].v;

        if ((row === 0 || row === 1) && colIdx >= 7) {
           s.border = {};
        }
        if (row >= footerStart && colIdx >= 8) {
           s.border = {};
        }

        if (row === 0 && colIdx === 5) {
           s.fill = { fgColor: { rgb: "FCD5B4" } };
           s.font.bold = true;
        }
        if (row === 0 && colIdx === 6) {
           s.fill = { fgColor: { rgb: "E6B8B7" } };
           s.font.color = { rgb: "FF0000" };
           s.font.bold = true;
        }

        if (row >= 3 && row <= listEndRow) {
           s.border = {
             top: { style: "thin", color: { rgb: "CCCCCC" } }, bottom: { style: "thin", color: { rgb: "CCCCCC" } },
             left: { style: "thin", color: { rgb: "CCCCCC" } }, right: { style: "thin", color: { rgb: "CCCCCC" } }
           };
           if (row === 3) delete s.border.bottom;
           if (row === 4) delete s.border.top;
           if (row === 4) s.border.bottom = { style: "thick", color: { rgb: "000000" } };
           if (row === 5) s.border.top = { style: "thick", color: { rgb: "000000" } };
           if (row === 3) s.border.top = { style: "thick", color: { rgb: "000000" } };
           if (row === listEndRow) s.border.bottom = { style: "thick", color: { rgb: "000000" } };
           
           if (colIdx === 0 || colIdx === 5 || colIdx === 10) s.border.left = { style: "thick", color: { rgb: "000000" } };
           if (colIdx === 4 || colIdx === 9 || colIdx === 14) s.border.right = { style: "thick", color: { rgb: "000000" } };
        }

        if ((row === 0 || row === 1) && colIdx === 2) s.alignment.horizontal = 'left';
        if (colIdx === 0 || colIdx === 5 || colIdx === 10) s.alignment.wrapText = false;
        if (row >= 5 && row <= listEndRow && (colIdx === 1 || colIdx === 6 || colIdx === 11)) {
           s.alignment.horizontal = 'left';
        }

        if (row === 3 || row === 4) {
          s.font.bold = true;
          if (colIdx <= 4) s.fill = { fgColor: { rgb: "F4CCCC" } };
          if (colIdx >= 5 && colIdx <= 9) s.fill = { fgColor: { rgb: "FCE5CD" } };
          if (colIdx >= 10) s.fill = { fgColor: { rgb: "FFF2CC" } };
        }

        if (row >= 5 && row <= listEndRow) {
           if (colIdx === 3 || colIdx === 8 || colIdx === 13) {
             const countVal = parseInt(val);
             if (!isNaN(countVal) && countVal > 0 && countVal >= top5Threshold) {
                s.fill = { fgColor: { rgb: "FCD5B4" } };
             }
           }
           if ((colIdx === 4 || colIdx === 9 || colIdx === 14) && String(val).includes('%')) {
             const rate = parseFloat(String(val).replace('%', ''));
             if (rate > 20) {
               s.fill = { fgColor: { rgb: "E6B8B7" } };
               s.font.color = { rgb: "FF0000" };
             }
           }
        }

        if (row >= footerStart && colIdx < 8) {
          s.font.sz = 16;
          s.font.bold = true;
          if (val === '自行車類別' || val === '模擬體驗類別' || val === '類別分數' || val === '總分' || 
              val === '異常數量' || val === '可動率' || val === '可動率扣分' || 
              val === '一級維護率' || val === '維護率扣分' || val === '模擬體驗總分') {
            s.fill = { fgColor: { rgb: "000000" } };
            s.font.color = { rgb: "FFC000" }; 
          }
          if (row === footerStart + 4 && colIdx === 7) s.font.sz = 22;
        }

        wsCity[key].s = s;
      }
      
      const safeSheetName = `${city.substring(0, 10)} 2.0_2.0E`; 
      XLSX.utils.book_append_sheet(wb, wsCity, safeSheetName);
    });

    XLSX.writeFile(wb, `YouBike綜合月報_${month}.xlsx`);
    ElMessage.success(` ${month} 報表下載成功！`);

  } catch (error) {
    console.error('匯出報表發生錯誤:', error);
    ElMessage.error('匯出失敗，請檢查網路連線或稍後再試。');
  } finally {
    loadingInstance.close();
  }
};