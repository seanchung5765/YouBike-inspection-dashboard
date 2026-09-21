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
// 🎨 共用樣式定義產生器
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

    const cityHeaders = currSummary
      .filter(r => r.city !== '總計' && allowedCities.includes(r.city))
      .map(r => r.city);

    if (cityHeaders.length === 0) {
      ElMessage.error('您目前沒有任何縣市的閱覽權限，無法匯出報表。');
      loadingInstance.close();
      return;
    }

    // 🌟 併發拉取 5 個月內所有縣市的缺失明細
    const allIssues = {};
    cityHeaders.forEach(c => allIssues[c] = {});
    
    const issuePromises = [];
    for (let c of cityHeaders) {
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
    const getUnitVal = (dataArr, city, key, unit) => {
      const val = getVal(dataArr, city, key);
      return val !== '-' ? `${val}${unit}` : '-';
    };
    const getRoundedVal = (dataArr, city, key) => {
      const val = getVal(dataArr, city, key);
      return val !== '-' ? Math.round(parseFloat(val)) : '-';
    };
    const getFixedRateVal1 = (dataArr, city, key) => {
      const val = getVal(dataArr, city, key);
      return val !== '-' ? `${parseFloat(val).toFixed(1)}%` : '-';
    };

    const standardColWidths = [30, ...cityHeaders.map(() => 16), 22];

    // ==========================================
    // 📝 Sheet 1: 成績與主管自評
    // ==========================================
    const summaryTitle = m0.replace('-', '/'); 
    
    const summaryAoA = [
      [summaryTitle, ...cityHeaders, '總計/平均值'],
      ['施測站數', ...cityHeaders.map(c => getVal(currSummary, c, 'tested_stations')), getVal(currSummary, '總計', 'tested_stations')],
      ['施測車輛數', ...cityHeaders.map(c => getVal(currSummary, c, 'total_bikes')), getVal(currSummary, '總計', 'total_bikes')],
      ['2.0E施測車輛數', ...cityHeaders.map(c => getVal(currSummary, c, 'ebikes_count')), getVal(currSummary, '總計', 'ebikes_count')],
      ['前後胎壓未達標準 (輛)', ...cityHeaders.map(c => getUnitVal(currSummary, c, 'tire_fail_count', '輛')), getUnitVal(currSummary, '總計', 'tire_fail_count', '輛')],
      ['前後胎壓未達標準 (%)', ...cityHeaders.map(c => getFixedRateVal1(currSummary, c, 'tire_fail_rate')), getFixedRateVal1(currSummary, '總計', 'tire_fail_rate')],
      ['場站妥善度', ...cityHeaders.map(c => getRoundedVal(currSummary, c, 'pure_station')), getRoundedVal(currSummary, '總計', 'pure_station')],
      ['自行車外觀與重要標示', ...cityHeaders.map(c => getRoundedVal(currSummary, c, 'pure_appearance')), getRoundedVal(currSummary, '總計', 'pure_appearance')],
      ['自行車重要機能', ...cityHeaders.map(c => getRoundedVal(currSummary, c, 'pure_function')), getRoundedVal(currSummary, '總計', 'pure_function')],
      ['一級維護率(EMS紀錄)', ...cityHeaders.map(c => getFixedRateVal1(currSummary, c, 'maintenance_rate')), getFixedRateVal1(currSummary, '總計', 'maintenance_rate')],
      ['可動率', ...cityHeaders.map(c => getFixedRateVal1(currSummary, c, 'availability_rate')), getFixedRateVal1(currSummary, '總計', 'availability_rate')],
      [`${m0}`, ...cityHeaders.map(c => getVal(currSummary, c, 'final_score')), getVal(currSummary, '總計', 'final_score')],
      ['', ...cityHeaders.map(c => getVal(currSummary, c, 'group_final_score')), ''], 
      [`${m1}`, ...cityHeaders.map(c => getVal(prevSummary, c, 'final_score')), getVal(prevSummary, '總計', 'final_score')],
      ['', ...cityHeaders.map(c => getVal(prevSummary, c, 'group_final_score')), ''], 
      ['主管測評', ...cityHeaders.map(c => getVal(currSummary, c, 'ops_final_score')), '-']
    ];
    
    const targetColIdx = cityHeaders.length + 3; 
    while(summaryAoA[11].length <= targetColIdx + 1) summaryAoA[11].push('');
    while(summaryAoA[15].length <= targetColIdx + 1) summaryAoA[15].push('');
    summaryAoA[11][targetColIdx] = '低於92分';
    summaryAoA[15][targetColIdx] = '高出施測分數5分以上';

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA);
    wsSummary['!cols'] = standardColWidths.map(w => ({ wch: w }));
    wsSummary['!merges'] = [
      { s: { r: 11, c: 0 }, e: { r: 12, c: 0 } }, 
      { s: { r: 13, c: 0 }, e: { r: 14, c: 0 } }, 
      { s: { r: 11, c: cityHeaders.length + 1 }, e: { r: 12, c: cityHeaders.length + 1 } }, 
      { s: { r: 13, c: cityHeaders.length + 1 }, e: { r: 14, c: cityHeaders.length + 1 } }, 
      { s: { r: 11, c: targetColIdx }, e: { r: 11, c: targetColIdx + 1 } }, 
      { s: { r: 15, c: targetColIdx }, e: { r: 15, c: targetColIdx + 1 } }, 
      ...buildGroupMerges(12, currSummary, cityHeaders), 
      ...buildGroupMerges(14, prevSummary, cityHeaders)  
    ];

    for(let r = 0; r < summaryAoA.length; r++) {
      for(let c = 0; c < summaryAoA[r].length; c++) {
        const cellRef = XLSX.utils.encode_cell({r, c});
        if(!wsSummary[cellRef]) continue;
        let s = getBaseStyle(16);

        if (r === 0) {
          s.font.bold = true;
          if (c > 0 && c <= cityHeaders.length + 1) s.fill = { fgColor: { rgb: "FDE9D9" } };
        }
        if (r === 5 && c > 0 && c <= cityHeaders.length) s.font.color = { rgb: "FF0000" };
        if (r === 5) s.border.bottom = { style: "medium", color: { rgb: "FF0000" } };
        if (r === 6) s.border.top = { style: "medium", color: { rgb: "FF0000" } };
        if (r === 8) s.border.bottom = { style: "medium", color: { rgb: "FF0000" } };
        if (r === 9) s.border.top = { style: "medium", color: { rgb: "FF0000" } };

        if (r >= 6 && r <= 8 && c > 0 && c <= cityHeaders.length) {
          const val = parseFloat(wsSummary[cellRef].v);
          const avgVal = parseFloat(summaryAoA[r][cityHeaders.length + 1]);
          if (!isNaN(val) && !isNaN(avgVal) && val < avgVal) {
            s.font.color = { rgb: "FF0000" };
            s.fill = { fgColor: { rgb: "CCC0DA" } };
          }
        }
        if ((r === 9 || r === 10) && c > 0 && c <= cityHeaders.length) {
          const val = parseFloat(String(wsSummary[cellRef].v).replace('%', ''));
          const threshold = r === 9 ? 90 : 99;
          if (!isNaN(val) && val < threshold) {
            s.font.color = { rgb: "FF0000" };
            s.fill = { fgColor: { rgb: "CCC0DA" } };
          }
        }
        if (r >= 11 && r <= 14) {
          if (c <= cityHeaders.length + 1) {
            s.font.bold = true;
            if (c > 0 && c <= cityHeaders.length) {
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
        if (r === 15 && c > 0 && c <= cityHeaders.length) {
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
    // 📝 Sheet 2: 可動率 & Sheet 3: 一級維護
    // ==========================================
    const availAoA = [
      [m0, ...cityHeaders, '總計'],
      ['抽驗場站數', ...cityHeaders.map(c => getVal(currSummary, c, 'tested_stations')), getVal(currSummary, '總計', 'tested_stations')],
      ['抽驗總在站車輛數', ...cityHeaders.map(c => getVal(currSummary, c, 'total_docked_bikes')), getVal(currSummary, '總計', 'total_docked_bikes')],
      ['無法租借車輛數', ...cityHeaders.map(c => getVal(currSummary, c, 'unrentable_bikes')), getVal(currSummary, '總計', 'unrentable_bikes')],
      ['在站車輛可動率', ...cityHeaders.map(c => getFixedRateVal1(currSummary, c, 'availability_rate_calc')), getFixedRateVal1(currSummary, '總計', 'availability_rate_calc')],
      [], 
      [m1, ...cityHeaders, '總計'],
      ['抽驗場站數', ...cityHeaders.map(c => getVal(prevSummary, c, 'tested_stations')), getVal(prevSummary, '總計', 'tested_stations')],
      ['抽驗總在站車輛數', ...cityHeaders.map(c => getVal(prevSummary, c, 'total_docked_bikes')), getVal(prevSummary, '總計', 'total_docked_bikes')],
      ['無法租借車輛數', ...cityHeaders.map(c => getVal(prevSummary, c, 'unrentable_bikes')), getVal(prevSummary, '總計', 'unrentable_bikes')],
      ['在站車輛可動率', ...cityHeaders.map(c => getFixedRateVal1(prevSummary, c, 'availability_rate_calc')), getFixedRateVal1(prevSummary, '總計', 'availability_rate_calc')]
    ];
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
        wsAvail[cellRef].s = s;
      }
    }
    XLSX.utils.book_append_sheet(wb, wsAvail, "可動率");

    const maintAoA = [
      [m0, ...cityHeaders, '總計'],
      ['總營運車輛數', ...cityHeaders.map(c => getVal(currSummary, c, 'total_fleet_bikes')), getVal(currSummary, '總計', 'total_fleet_bikes')],
      ['事故車輛數', ...cityHeaders.map(c => getVal(currSummary, c, 'accident_bikes')), getVal(currSummary, '總計', 'accident_bikes')],
      ['一級維護紀錄數', ...cityHeaders.map(c => getVal(currSummary, c, 'maintenance_records')), getVal(currSummary, '總計', 'maintenance_records')],
      ['一級維護率', ...cityHeaders.map(c => getFixedRateVal1(currSummary, c, 'maintenance_rate')), getFixedRateVal1(currSummary, '總計', 'maintenance_rate')],
      ['較上個月變動', ...cityHeaders.map(c => {
         const diff = parseFloat(getVal(currSummary, c, 'maintenance_rate')) - parseFloat(getVal(prevSummary, c, 'maintenance_rate') || 0);
         return isNaN(diff) ? '-' : `${diff.toFixed(1)}%`;
      }), '-'],
      [], 
      [m1, ...cityHeaders, '總計'],
      ['總營運車輛數', ...cityHeaders.map(c => getVal(prevSummary, c, 'total_fleet_bikes')), getVal(prevSummary, '總計', 'total_fleet_bikes')],
      ['事故車輛數', ...cityHeaders.map(c => getVal(prevSummary, c, 'accident_bikes')), getVal(prevSummary, '總計', 'accident_bikes')],
      ['一級維護紀錄數', ...cityHeaders.map(c => getVal(prevSummary, c, 'maintenance_records')), getVal(prevSummary, '總計', 'maintenance_records')],
      ['一級維護率', ...cityHeaders.map(c => getFixedRateVal1(prevSummary, c, 'maintenance_rate')), getFixedRateVal1(prevSummary, '總計', 'maintenance_rate')]
    ];
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
        if (r === 5 && c > 0 && c <= cityHeaders.length) {
          const val = parseFloat(String(wsMaint[cellRef].v).replace('%', ''));
          if (!isNaN(val)) {
            if (val < 0) s.font.color = { rgb: "FF0000" };
            else if (val > 5) s.font.color = { rgb: "00B0F0" }; 
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

    issueAoA.push([
      '地區/月份', 
      m0_display, '', '', '', 
      m1_display, '', '', '', 
      m2_display, '', '', ''
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
      { s: { r: 0, c: 9 }, e: { r: 0, c: 12 } }
    ];

    let rowIdx = 2;
    const allCityDicts = {}; 
    const cityColors = ["F4CCCC", "D9EAD3", "93C47D", "6AA84F", "FCE5CD", "F9CB9C", "D0E0E3", "A4C2F4", "6D9EEB", "3C78D8"];

    cityHeaders.forEach((city, cityIndex) => {
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
          rowData.push(name, item.count, `${Math.round(item.rate)}%`, diff.text);
        } else rowData.push('', '', '', '');

        if (r < list1.length) {
          const [name, item] = list1[r];
          const diff = getDiffDisplay(item, d2[name]);
          rowData.push(name, item.count, `${Math.round(item.rate)}%`, diff.text);
        } else rowData.push('', '', '', '');

        if (r < list2.length) {
          const [name, item] = list2[r];
          const diff = getDiffDisplay(item, d3[name]);
          rowData.push(name, item.count, `${Math.round(item.rate)}%`, diff.text);
        } else rowData.push('', '', '', '');

        issueAoA.push(rowData);
      }
      issueMerges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx + 9, c: 0 } });
      rowIdx += 10;
    });

    const wsIssue = XLSX.utils.aoa_to_sheet(issueAoA);
    wsIssue['!merges'] = issueMerges;
    wsIssue['!cols'] = [12, 45, 12, 12, 12, 45, 12, 12, 12, 45, 12, 12, 12].map(w => ({ wch: w }));
    wsIssue['!rows'] = [{ hpt: 40 }];

    for (const key in wsIssue) {
      if (key.startsWith('!')) continue;
      let s = getBaseStyle(12);
      const col = XLSX.utils.decode_cell(key).c;
      const row = parseInt(key.replace(/[A-Z]/g, '')) - 1; 
      const val = wsIssue[key].v;

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
          s.fill = { fgColor: { rgb: cityColors[cityIndex % cityColors.length] || "FFFFFF" } };
          s.border.bottom = { style: "thin", color: { rgb: "000000" } };
          if ((row - 1) % 10 === 0) s.border.bottom = { style: "thick", color: { rgb: "000000" } };
        }
        
        if ((row - 1) % 10 === 0) {
          s.border.bottom = { style: "thick", color: { rgb: "000000" } };
        }

        const currentCity = cityHeaders[cityIndex];
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
      wsIssue[key].s = s;
    }
    XLSX.utils.book_append_sheet(wb, wsIssue, "問題點");


    // ==========================================
    // 🚲 Sheet 5+: 各縣市明細
    // ==========================================
    const roundInt = (v) => (v !== undefined && v !== null && v !== '-') ? Math.round(parseFloat(v)) : '-';
    const round1Dec = (v) => (v !== undefined && v !== null && v !== '-') ? parseFloat(v).toFixed(1) : '-';
    const round2Dec = (v) => (v !== undefined && v !== null && v !== '-') ? parseFloat(v).toFixed(2) : '-';

    cityHeaders.forEach((city) => {
      const issueRes = allIssues[city][m0];
      if (!issueRes) return;

      const { A, B, C, summary } = issueRes;
      const citySummary = currSummary.find(r => r.city === city) || {};
      
      // 🌟 嚴謹處理同分可共存的前五名門檻
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

        // 🌟 清除不必要的表頭右側框線 (H欄以後)
        if ((row === 0 || row === 1) && colIdx >= 7) {
           s.border = {};
        }
        // 🌟 清除底部不必要的框線 (I欄以後)
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
           // 🌟 精準使用門檻值邏輯：同分者皆可上色，符合你的「同分就算同排名沒關係」
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

        // 確保底部只有 A~H 欄位(colIdx 0~7) 有底色和粗體樣式
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
    ElMessage.success(`🎉 ${month} 報表下載成功！`);

  } catch (error) {
    console.error('匯出報表發生錯誤:', error);
    ElMessage.error('匯出失敗，請檢查網路連線或稍後再試。');
  } finally {
    loadingInstance.close();
  }
};