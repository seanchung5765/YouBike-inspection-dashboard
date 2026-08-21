<template>
  <div class="summary-container">
    
    <el-card style="margin-bottom: 20px;">
      <template #header>
        <div class="mobile-header">
          <h2>🏆 總分表</h2>
          <div class="header-right-actions">
            <el-select v-model="selectedMonth" placeholder="選擇月份" @change="fetchSummary" style="width: 130px;">
              <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
            </el-select>
            <el-button 
              v-if="currentUser.role_level >= 90" 
              type="primary" 
              @click="handleRecalculate" 
              :loading="calculating" 
              :disabled="!selectedMonth || monthStatus === 'published'"
            >
              <el-icon><Refresh /></el-icon> 重新結算
            </el-button>
          </div>
        </div>
      </template>

      <!-- 🌟 加入 getCellStyle 判斷顏色，並保留 processedTableData -->
      <el-table :data="processedTableData" v-loading="loading" border stripe style="width: 100%" :span-method="objectSpanMethod" :cell-style="getCellStyle">
        <el-table-column prop="city" label="地區" min-width="120" fixed="left" align="center">
          <template #default="scope">
            <span style="font-weight: bold; font-size: 1.1em;">{{ scope.row.city }}</span>
          </template>
        </el-table-column>

        <el-table-column label="整體" align="center">
          <el-table-column prop="pure_station" label="場站妥善度" min-width="130" align="center">
             <template #default="scope">{{ roundScore(scope.row.pure_station) }} 分</template>
          </el-table-column>
          <el-table-column prop="pure_appearance" label="外觀與重要標示" min-width="180" align="center">
            <template #default="scope">{{ roundScore(scope.row.pure_appearance) }} 分</template>
          </el-table-column>
          <el-table-column prop="pure_function" label="重要機能" min-width="120" align="center">
            <template #default="scope">{{ roundScore(scope.row.pure_function) }} 分</template>
          </el-table-column>
        </el-table-column>

        <el-table-column label="2.0 分數" align="center">
          <el-table-column prop="anomalies_2_0" label="異常件數" min-width="90" align="center" />
          <el-table-column prop="score_2_0_appearance" label="外觀與重要標示" min-width="150" align="center">
            <template #default="scope">{{ roundScore(scope.row.score_2_0_appearance) }} 分</template>
          </el-table-column>
          <el-table-column prop="score_2_0_function" label="重要機能" min-width="120" align="center">
            <template #default="scope">{{ roundScore(scope.row.score_2_0_function) }} 分</template>
          </el-table-column>
          <el-table-column prop="score_2_0" label="總分" min-width="100" align="center">
            <template #default="scope">
              <!-- 🌟 取到小數點後第 1 位 -->
              <span style="font-weight: bold; font-size: 1.1em; color: #409EFF;">{{ formatOneDecimal(scope.row.score_2_0) }}</span>
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column label="2.0E 分數" align="center">
          <el-table-column prop="anomalies_2_0e" label="異常件數" min-width="90" align="center" />
          <el-table-column prop="score_2_0e_appearance" label="外觀與重要標示" min-width="150" align="center">
            <template #default="scope">{{ roundScore(scope.row.score_2_0e_appearance) }} 分</template>
          </el-table-column>
          <el-table-column prop="score_2_0e_function" label="重要機能" min-width="120" align="center">
            <template #default="scope">{{ roundScore(scope.row.score_2_0e_function) }} 分</template>
          </el-table-column>
          <el-table-column prop="score_2_0e" label="總分" min-width="100" align="center">
            <template #default="scope">
              <!-- 🌟 取到小數點後第 1 位 -->
              <span style="font-weight: bold; font-size: 1.1em; color: #409EFF;">{{ formatOneDecimal(scope.row.score_2_0e) }}</span>
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column prop="maintenance_rate" label="一級維護率" min-width="120" align="center">
          <template #default="scope">{{ scope.row.maintenance_rate }}%</template>
        </el-table-column>
        <el-table-column prop="availability_rate_calc" label="可動率" min-width="110" align="center">
          <template #default="scope">{{ scope.row.availability_rate_calc }}%</template>
        </el-table-column>

        <el-table-column prop="final_score" label="總分" min-width="100" align="center" fixed="right">
          <template #default="scope">
            <span style="font-size: 1.2em; font-weight: bold;">
              {{ formatTwoDecimals(scope.row.final_score) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="display_group_name" label="營運區" min-width="100" align="center" fixed="right">
          <template #default="scope">
            <span style="font-weight: bold; font-size: 1.1em;">{{ scope.row.display_group_name }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="display_group_score" label="營運區總分" min-width="110" align="center" fixed="right">
          <template #default="scope">
            <span style="font-size: 1.4em; font-weight: bold; color: #E6A23C;">
              {{ formatTwoDecimals(scope.row.display_group_score) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="ops_final_score" label="主管測評" min-width="110" align="center" fixed="right">
          <template #default="scope">
            <span style="font-size: 1.2em; font-weight: bold; color: #909399;">
              {{ scope.row.ops_final_score ? formatTwoDecimals(scope.row.ops_final_score) : '-' }}
            </span>
          </template>
        </el-table-column>

      </el-table>
    </el-card>

        <el-card style="margin-bottom: 20px;">
      <template #header>
        <div class="mobile-header">
          <h2>📊 基礎施測數據與胎壓檢測</h2>
        </div>
      </template>

      <!-- 🌟 改綁定 normalTableData (排除總計行) -->
      <el-table :data="normalTableData" v-loading="loading" border stripe style="width: 100%" show-summary :summary-method="getSummaries">
        <el-table-column prop="city" label="地區" min-width="100" fixed="left" align="center">
          <template #default="scope">
            <span style="font-weight: bold; font-size: 1.1em;">{{ scope.row.city }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="tested_stations" label="施測站數" min-width="90" align="center" />
        <el-table-column prop="total_bikes" label="施測車輛數" min-width="100" align="center" />
        <el-table-column prop="bikes_2_0_count" label="2.0 施測車輛數" min-width="100" align="center" />
        <el-table-column prop="ebikes_count" label="2.0E 施測車輛數" min-width="100" align="center" />
          
        <el-table-column label="前後胎壓檢測" align="center">
          <el-table-column prop="tire_fail_count" label="未達標準(輛)" min-width="110" align="center" />
          <el-table-column prop="tire_fail_rate" label="未達標準" min-width="110" align="center">
            <template #default="scope">
              <span :style="{ color: scope.row.tire_fail_rate > 10 ? 'red' : 'inherit' }">
                {{ scope.row.tire_fail_rate }}%
              </span>
            </template>
          </el-table-column>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-bottom: 20px;">
      <template #header>
        <div class="mobile-header">
          <h2>📊 可動率</h2>
        </div>
      </template>
      
      <el-table :data="normalTableData" v-loading="loading" border stripe style="width: 100%" :show-summary="true" :summary-method="getAvailabilitySummary" :cell-style="getAvailabilityStyle">
        <el-table-column prop="city" label="地區" min-width="120" fixed="left" align="center">
          <template #default="scope">
            <span style="font-weight: bold; font-size: 1.1em;">{{ scope.row.city }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="inspection_count" label="抽驗場站數" min-width="100" align="center" />
        <el-table-column prop="total_docked_bikes" label="抽驗總在站車輛數" min-width="100" align="center" />
        <el-table-column prop="unrentable_bikes" label="無法租借車輛數" min-width="120" align="center" />
        
        <el-table-column prop="availability_rate_calc" label="在站車輛可動率" min-width="150" align="center">
          <template #default="scope">
            <span style="font-weight: bold; font-size: 1.1em;">{{ scope.row.availability_rate_calc }}%</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="availability_penalty" label="總分扣分" min-width="100" align="center">
          <template #default="scope">
            <span :style="{ color: scope.row.availability_penalty < 0 ? 'red' : 'green', fontWeight: 'bold', fontSize: '1.1em' }">
              {{ scope.row.availability_penalty }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card>
      <template #header>
        <div class="mobile-header">
          <h2>🛠️ 一級維護
            <span v-if="currentUser.role_level >= 90" style="font-size: 14px; color: #909399; margin-left: 10px; font-weight: normal;">
              (高階管理員專用 {{ monthStatus === 'published' ? '唯讀模式' : '編輯區' }})
            </span>
          </h2>
        </div>
      </template>
      
      <el-table :data="normalTableData" v-loading="loading" border stripe style="width: 100%" :show-summary="true" :summary-method="getMaintenanceSummary">
        <el-table-column prop="city" label="評估區域" min-width="100" fixed="left" align="center">
          <template #default="scope">
            <span style="font-weight: bold; font-size: 1.1em;">{{ scope.row.city }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="total_fleet_bikes" label="總營運車輛數" min-width="120" align="center">
          <template #default="scope">
            <el-input-number v-if="currentUser.role_level >= 90 && monthStatus !== 'published'" v-model="scope.row.total_fleet_bikes" :min="0" :controls="false" style="width: 100%" @change="saveMaintenance(scope.row, 'total_fleet_bikes', scope.row.total_fleet_bikes)" />
            <span v-else style="font-size: 1.1em;">{{ scope.row.total_fleet_bikes || 0 }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="accident_bikes" label="事故車輛數" min-width="120" align="center">
          <template #default="scope">
            <el-input-number v-if="currentUser.role_level >= 90 && monthStatus !== 'published'" v-model="scope.row.accident_bikes" :min="0" :controls="false" style="width: 100%" @change="saveMaintenance(scope.row, 'accident_bikes', scope.row.accident_bikes)" />
            <span v-else style="font-size: 1.1em;">{{ scope.row.accident_bikes || 0 }}</span>
          </template>
        </el-table-column>

        <!-- 🌟 在 el-table-column 加上 v-if 進行權限阻擋 -->
        <el-table-column v-if="currentUser.role_level >= 90" prop="broken_bikes" label="故障車輛數" min-width="120" align="center">
          <template #default="scope">
            <el-input-number v-if="currentUser.role_level >= 90 && monthStatus !== 'published'" v-model="scope.row.broken_bikes" :min="0" :controls="false" style="width: 100%" @change="saveMaintenance(scope.row, 'broken_bikes', scope.row.broken_bikes)" />
            <span v-else style="font-size: 1.1em;">{{ scope.row.broken_bikes || 0 }}</span>
          </template>
        </el-table-column>

        <!-- 🌟 在 el-table-column 加上 v-if 進行權限阻擋 -->
        <el-table-column v-if="currentUser.role_level >= 90" prop="broken_rate" label="故障車比率" min-width="110" align="center">
          <template #default="scope">
            <span style="color: #909399;">
              {{ scope.row.total_fleet_bikes > 0 ? ((scope.row.broken_bikes / scope.row.total_fleet_bikes) * 100).toFixed(2) + '%' : '0.00%' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="maintenance_records" label="一級維護記錄數" min-width="120" align="center">
          <template #default="scope">
            <el-input-number v-if="currentUser.role_level >= 90 && monthStatus !== 'published'" v-model="scope.row.maintenance_records" :min="0" :controls="false" style="width: 100%" @change="saveMaintenance(scope.row, 'maintenance_records', scope.row.maintenance_records)" />
            <span v-else style="font-size: 1.1em;">{{ scope.row.maintenance_records || 0 }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="maintenance_rate" label="一級維護率" min-width="140" align="center">
          <template #default="scope">
            <span style="font-weight: bold; font-size: 1.1em;">{{ scope.row.maintenance_rate }}%</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="maintenance_penalty" label="總分扣分" min-width="90" align="center">
          <template #default="scope">
            <span :style="{ color: scope.row.maintenance_penalty < 0 ? 'red' : 'green', fontWeight: 'bold', fontSize: '1.2em' }">
              {{ scope.row.maintenance_penalty }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getReportSummaryAPI, recalculateReportAPI, getReportMonthsAPI, updateMaintenanceDataAPI } from '../../api/report' 

const loading = ref(false)
const calculating = ref(false)
const monthOptions = ref([]) 
const selectedMonth = ref('')
const monthStatus = ref('draft') 

const tableData = ref([])
const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

// 🌟 自訂儲存格顏色判斷 (可動率表)
const getAvailabilityStyle = ({ row, column }) => {
  if (!totalAvgRow.value) return {};

  if (column.property === 'availability_rate_calc') {
    let style = {};
    const cellVal = Number(row.availability_rate_calc);
    const avgVal = Number(totalAvgRow.value.availability_rate_calc); // 抓取總計行的平均可動率

    if (!isNaN(cellVal)) {
      // 1. 低於平均黃底
      if (!isNaN(avgVal) && cellVal < avgVal) {
        style.backgroundColor = '#FFF8E1'; 
      }
      // 2. 低於 99% 加紅字 (可覆蓋黃底上的字體顏色)
      if (cellVal < 99) {
        style.color = '#F56C6C'; 
        style.fontWeight = 'bold';
      }
    }
    return style;
  }
  return {};
};

const roundScore = (val) => {
  if (val === null || val === undefined || val === '無資料' || val === '-') return val;
  const num = Number(val);
  return isNaN(num) ? val : Math.round(num);
};

const formatTwoDecimals = (val) => {
  if (val === null || val === undefined || val === '無資料' || val === '-') return val;
  const num = Number(val);
  return isNaN(num) ? val : num.toFixed(2);
};

// 🌟 新增：針對 2.0 與 2.0E 總分的 1 位小數處理
const formatOneDecimal = (val) => {
  if (val === null || val === undefined || val === '無資料' || val === '-') return val;
  const num = Number(val);
  return isNaN(num) ? val : num.toFixed(2);
};

// 🌟 將「總計」過濾掉的一般表格資料 (用於可動率、一級維護的自動加總)
const normalTableData = computed(() => {
  if (!tableData.value) return [];
  return tableData.value.filter(r => r.city !== '總計');
});

// 🌟 提取「總計」列的資料 (用於對比顏色)
const totalAvgRow = computed(() => {
  if (!tableData.value) return null;
  return tableData.value.find(r => r.city === '總計');
});

const processedTableData = computed(() => {
  const data = normalTableData.value;
  if (data.length === 0) return [];
  
  let result = []; 
  let currentGroup = null; 
  let tempGroupRows = [];
  
  const flushGroup = () => {
    if (tempGroupRows.length === 0) return;
    const groupScore = tempGroupRows[0].group_final_score !== null ? tempGroupRows[0].group_final_score : '無資料';
    const validOpsRow = tempGroupRows.find(r => r.ops_final_score && r.ops_final_score !== 'null');
    const groupOpsScore = validOpsRow ? validOpsRow.ops_final_score : '-';

    tempGroupRows.forEach((r, idx) => {
      result.push({ 
        ...r, 
        display_group_name: currentGroup, 
        display_group_score: groupScore,
        display_ops_score: groupOpsScore, 
        rowspan: idx === 0 ? tempGroupRows.length : 0 
      });
    });
    tempGroupRows = [];
  };

  data.forEach(row => {
    const gName = row.merge_group || row.city; 
    if (gName !== currentGroup) { 
      flushGroup(); 
      currentGroup = gName; 
    }
    tempGroupRows.push(row);
  });
  
  flushGroup(); 

  // 🌟 將資料庫算好的「總計」加回最後面
  if (totalAvgRow.value) {
    result.push({
      ...totalAvgRow.value,
      display_group_name: '-',
      display_group_score: '-',
      ops_final_score: '-',
      rowspan: 1
    });
  }

  return result;
});

const objectSpanMethod = ({ row, column }) => {
  if (column.property === 'display_group_name' || column.property === 'display_group_score') {
    if (row.rowspan > 0) return { rowspan: row.rowspan, colspan: 1 };
    else return { rowspan: 0, colspan: 0 }; 
  }
};

// 🌟 自訂儲存格顏色判斷 (總分表)
const getCellStyle = ({ row, column }) => {
  // 總計行底色給灰色
  if (row.city === '總計') return { backgroundColor: '#F2F6FC', fontWeight: 'bold' };

  if (!totalAvgRow.value) return {};

  // 1. 細項分數：低於平均黃底，不要紅字
  const detailColumns = [
    'pure_station', 'pure_appearance', 'pure_function',
    'score_2_0_appearance', 'score_2_0_function',
    'score_2_0e_appearance', 'score_2_0e_function'
  ];

  // 2. 總分：低於 92 分紅字，不要黃底
  const totalColumns = [
    'score_2_0', 'score_2_0e', 'final_score'
  ];

  let style = {};

  if (detailColumns.includes(column.property)) {
    const cellVal = Number(row[column.property]);
    const avgVal = Number(totalAvgRow.value[column.property]);
    
    // 細項：只判斷黃底
    if (!isNaN(cellVal) && !isNaN(avgVal) && cellVal < avgVal) {
      style.backgroundColor = '#FFF8E1'; 
    }
  } 
  else if (totalColumns.includes(column.property)) {
    const cellVal = Number(row[column.property]);
    
    // 總分：只判斷紅字
    if (!isNaN(cellVal) && cellVal < 92) {
      style.color = '#F56C6C'; 
      style.fontWeight = 'bold';
    }
  }

  return style;
};

// 🌟 100% 純顯示版：前端不碰任何數學與扣分邏輯
const saveMaintenance = async (row, field, value) => {
  try {
    // 1. 將使用者輸入的數值存入資料庫
    await updateMaintenanceDataAPI(selectedMonth.value, row.city, field, value);
    
    calculating.value = true;
    
    // 2. 呼叫後端核心引擎重新結算 (讓後端去算那些 Penalty 跟加總)
    await recalculateReportAPI(selectedMonth.value);
    
    // 3. 重新撈取後端算好的最新完整報表來顯示
    await fetchSummary();
    
    ElMessage.success('分數已自動更新！');
  } catch (error) { 
    ElMessage.error('儲存或結算失敗，請稍後再試'); 
  } finally {
    calculating.value = false;
  }
}

const getAvailabilitySummary = (param) => {
  const { columns, data } = param; const sums = [];
  let totalInspection = 0, totalDocked = 0, totalUnrentable = 0, totalPenalty = 0;
  data.forEach(row => {
    totalInspection += Number(row.inspection_count) || 0; totalDocked += Number(row.total_docked_bikes) || 0;
    totalUnrentable += Number(row.unrentable_bikes) || 0; totalPenalty += Number(row.availability_penalty) || 0;
  });
  columns.forEach((column, index) => {
    if (index === 0) { sums[index] = '總計'; return; }
    switch (column.property) {
      case 'inspection_count': sums[index] = totalInspection; break;
      case 'total_docked_bikes': sums[index] = totalDocked; break;
      case 'unrentable_bikes': sums[index] = totalUnrentable; break;
      case 'availability_rate_calc':
        sums[index] = totalDocked > 0 ? (((totalDocked - totalUnrentable) / totalDocked) * 100).toFixed(2) + '%' : '100.00%'; break;
      case 'availability_penalty': sums[index] = totalPenalty; break;
      default: sums[index] = '';
    }
  }); return sums;
};

const getSummaries = (param) => {
  const { columns, data } = param;
  const sums = [];
  
  let sumTotalBikes = 0;
  let sumFailBikes = 0;
  data.forEach(row => {
    sumTotalBikes += Number(row.total_bikes) || 0;
    sumFailBikes += Number(row.tire_fail_count) || 0;
  });

  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '總計';
      return;
    }
    
    if (column.property === 'tire_fail_rate') {
      sums[index] = sumTotalBikes > 0 ? ((sumFailBikes / sumTotalBikes) * 100).toFixed(2) + '%' : '0.00%';
      return;
    }

    const values = data.map(item => Number(item[column.property]));
    if (!values.every(value => isNaN(value))) {
      sums[index] = values.reduce((prev, curr) => {
        const value = Number(curr);
        return !isNaN(value) ? prev + curr : prev;
      }, 0);
    } else {
      sums[index] = '';
    }
  });

  return sums;
};

const getMaintenanceSummary = (param) => {
  const { columns, data } = param; const sums = [];
  let sumTotal = 0, sumAccident = 0, sumBroken = 0, sumRecords = 0;
  data.forEach(row => {
    sumTotal += Number(row.total_fleet_bikes) || 0; 
    sumAccident += Number(row.accident_bikes) || 0;
    sumBroken += Number(row.broken_bikes) || 0; 
    sumRecords += Number(row.maintenance_records) || 0;
  });
  columns.forEach((column, index) => {
    if (index === 0) { sums[index] = '總計'; return; }
    switch (column.property) {
      case 'total_fleet_bikes': sums[index] = sumTotal; break;
      case 'accident_bikes': sums[index] = sumAccident; break;
      case 'broken_bikes': sums[index] = sumBroken; break; 
      case 'broken_rate': sums[index] = sumTotal > 0 ? ((sumBroken / sumTotal) * 100).toFixed(2) + '%' : '0.00%'; break;
      case 'maintenance_records': sums[index] = sumRecords; break;
      case 'maintenance_rate':
        const valid = sumTotal - sumAccident - sumBroken;
        sums[index] = valid > 0 ? ((sumRecords / valid) * 100).toFixed(2) + '%' : '0.00%'; break;
      default: 
        if(column.label === '故障車數') sums[index] = sumBroken;
        else sums[index] = '';
    }
  }); return sums;
};

const initDashboard = async () => {
  try {
    const res = await getReportMonthsAPI(currentUser.role_level)
    if (res.data.success && res.data.data.length > 0) {
      monthOptions.value = res.data.data
      selectedMonth.value = monthOptions.value[0]
      fetchSummary()
    } else {
      ElMessage.warning('目前尚無任何報表資訊')
    }
  } catch (error) { ElMessage.error('無法取得月份清單') }
}

const fetchSummary = async () => {
  if (!selectedMonth.value) return; 
  loading.value = true
  try {
    const res = await getReportSummaryAPI(selectedMonth.value, currentUser.id, currentUser.role_level)
    if (res.data.success) {
      tableData.value = res.data.data
      monthStatus.value = res.data.status 
    }
  } catch (error) { ElMessage.error('無法取得總分表資料') } 
  finally { loading.value = false }
}

const handleRecalculate = async () => {
  calculating.value = true
  try {
    const res = await recalculateReportAPI(selectedMonth.value)
    if (res.data.success) {
      ElMessage.success('重新結算成功！')
      fetchSummary()
    }
  } catch (error) { ElMessage.error('結算失敗') } 
  finally { calculating.value = false }
}

onMounted(() => initDashboard())
</script>

<style scoped>
.summary-container { padding: 0 10px; }
h2 { margin: 0; }

.mobile-header {
  display: flex; 
  justify-content: space-between; 
  align-items: center;
  width: 100%;
}
.header-right-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}

@media (max-width: 768px) {
  .mobile-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }
  .header-right-actions {
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 10px;
  }
  .header-right-actions .el-select, 
  .header-right-actions .el-button {
    width: 100% !important;
    margin-left: 0 !important;
  }
}
</style>