<template>
  <div class="city-issue-container" v-loading="loading">
    <el-card>
      <template #header>
        <div class="mobile-header">
          <h2>🚨 缺失統計表</h2>
          <div class="header-right-actions">
            <el-select v-model="selectedMonth" placeholder="選擇月份" @change="fetchData" style="width: 120px;">
              <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
            </el-select>
            <el-select v-model="selectedCity" placeholder="選擇縣市" @change="fetchData" style="width: 120px;">
              <el-option v-for="c in cityOptions" :key="c" :label="c" :value="c" />
            </el-select>
          </div>
        </div>
      </template>

      <div class="summary-bar" v-if="summary">
        <span>施測總站數：<strong>{{ summary.totalStations }}</strong> 站</span>
        <span>2.0 施測數量：<strong>{{ summary.totalBikes - summary.ebikesCount }}</strong> 輛</span>
        <span>2.0E 施測數量：<strong>{{ summary.ebikesCount }}</strong> 輛</span>
        <span class="legend">備註：異常件數 &ge; 5 項底色提醒，異常率 &gt; 20% 紅字</span>
      </div>

      <el-row :gutter="20" class="table-row">
        
        <!-- A 級 -->
        <el-col :span="24" style="margin-bottom: 20px;">
          <div class="level-title bg-a">重大問題(安全) A級</div>
          <el-table :data="issueData.A" border stripe size="small" :cell-class-name="cellStyleHandler" style="width: 100%">
            <el-table-column prop="major_category" label="分類" width="200" align="center" />
            <el-table-column prop="sub_category" label="位置" width="180" align="center" />
            <!-- 🌟 新增車種欄位 -->
            <el-table-column prop="bike_type" label="車種" width="80" align="center" />
            <el-table-column prop="item_name" label="缺失項目" min-width="250" />
            <el-table-column prop="fail_count" label="異常件數" width="90" align="center" />
            <el-table-column prop="fail_rate" label="異常率" width="80" align="center">
              <template #default="scope">{{ scope.row.fail_rate }}%</template>
            </el-table-column>
          </el-table>
        </el-col>

        <!-- B 級 -->
        <el-col :span="24" style="margin-bottom: 20px;">
          <div class="level-title bg-b">重點問題(觀感) B級</div>
          <el-table :data="issueData.B" border stripe size="small" :cell-class-name="cellStyleHandler" style="width: 100%">
            <el-table-column prop="major_category" label="分類" width="200" align="center" />
            <el-table-column prop="sub_category" label="位置" width="180" align="center" />
            <!-- 🌟 新增車種欄位 -->
            <el-table-column prop="bike_type" label="車種" width="80" align="center" />
            <el-table-column prop="item_name" label="缺失項目" min-width="250" />
            <el-table-column prop="fail_count" label="異常件數" width="90" align="center" />
            <el-table-column prop="fail_rate" label="異常率" width="80" align="center">
              <template #default="scope">{{ scope.row.fail_rate }}%</template>
            </el-table-column>
          </el-table>
        </el-col>

        <!-- C 級 -->
        <el-col :span="24" style="margin-bottom: 10px;">
          <div class="level-title bg-c">一般問題(內部管理) C級</div>
          <el-table :data="issueData.C" border stripe size="small" :cell-class-name="cellStyleHandler" style="width: 100%">
            <el-table-column prop="major_category" label="分類" width="200" align="center" />
            <el-table-column prop="sub_category" label="位置" width="180" align="center" />
            <!-- 🌟 新增車種欄位 -->
            <el-table-column prop="bike_type" label="車種" width="80" align="center" />
            <el-table-column prop="item_name" label="缺失項目" min-width="250" />
            <el-table-column prop="fail_count" label="異常件數" width="90" align="center" />
            <el-table-column prop="fail_rate" label="異常率" width="80" align="center">
              <template #default="scope">{{ scope.row.fail_rate }}%</template>
            </el-table-column>
          </el-table>
        </el-col>

      </el-row>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getCityIssuesAPI, getReportMonthsAPI, getReportCitiesAPI } from '../../api/report' 

const loading = ref(false)
const selectedMonth = ref('') 
const selectedCity = ref('')    
const monthOptions = ref([]) 
const cityOptions = ref([])

const issueData = ref({ A: [], B: [], C: [] })
const summary = ref({ totalStations: 0, totalBikes: 0, ebikesCount: 0 })

const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

const fetchFilters = async () => {
  loading.value = true;
  try {
    const [monthRes, cityRes] = await Promise.all([
      getReportMonthsAPI(currentUser.role_level),
      getReportCitiesAPI(currentUser.id, currentUser.role_level)
    ]);

    if (monthRes.data.success && monthRes.data.data.length > 0) {
      monthOptions.value = monthRes.data.data;
      selectedMonth.value = monthOptions.value[0]; 
    }
    if (cityRes.data.success && cityRes.data.data.length > 0) {
      cityOptions.value = cityRes.data.data;
      selectedCity.value = cityOptions.value[0]; 
    }
    if (selectedMonth.value && selectedCity.value) {
      await fetchData();
    }
  } catch (error) {
    console.error('取得選單失敗:', error);
  } finally {
    loading.value = false;
  }
}

const fetchData = async () => {
  if (!selectedMonth.value || !selectedCity.value) return;
  loading.value = true;
  try {
    const res = await getCityIssuesAPI(selectedMonth.value, selectedCity.value, currentUser.id);
    if (res.data.success) {
      issueData.value.A = res.data.data.A;
      issueData.value.B = res.data.data.B;
      issueData.value.C = res.data.data.C;
      summary.value = res.data.data.summary;
    }
  } catch (error) {
    console.error('獲取表格資料失敗', error);
  } finally {
    loading.value = false;
  }
}

const cellStyleHandler = ({ row, column }) => {
  // 異常率 > 20% 給予 'highlight-red-text' 類別
  if (column.property === 'fail_rate' && row.fail_rate > 20) {
    return 'highlight-red-text';
  }
  // 異常件數 >= 5 給予 'highlight-danger-bg' 類別
  if (column.property === 'fail_count' && row.fail_count >= 5) {
    return 'highlight-danger-bg';
  }
  return '';
}

onMounted(() => fetchFilters())
</script>

<style scoped>
.city-issue-container { padding: 0 10px; }
h2 { margin: 0; }

.summary-bar { background-color: #f5f7fa; padding: 10px 15px; border-radius: 4px; margin-bottom: 25px; display: flex; gap: 30px; font-size: 14px; }
.summary-bar .legend { color: #e6a23c; margin-left: auto; font-weight: bold; }
.level-title { text-align: center; font-size: 16px; font-weight: bold; padding: 10px; border: 1px solid #ebeef5; border-bottom: none; }
.bg-a { background-color: #f4cccc; }
.bg-b { background-color: #fce5cd; }
.bg-c { background-color: #fff2cc; }
:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) { background-color: #f2f4f7 !important; }

/* 🌟 新增：缺失統計表的異常警告樣式 */
:deep(.highlight-red-text) {
  color: red !important;
  font-weight: bold !important;
}

:deep(.highlight-danger-bg) {

  color: red !important;
  font-weight: bold !important;
}

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
  .city-issue-container { padding: 0; }
  
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
  
  .summary-bar { flex-direction: column; gap: 8px; font-size: 13px; padding: 10px; margin-bottom: 15px; }
  .summary-bar .legend { margin-left: 0; margin-top: 5px; }

  :deep(.el-card__header) { padding: 10px 12px; }
  :deep(.el-card__body) { padding: 10px 5px; }
  :deep(.el-table .cell) { padding: 0 5px; font-size: 13px; line-height: 1.4; }
  :deep(.el-table th.el-table__cell) { font-size: 13px; padding: 4px 0; }
}
</style>