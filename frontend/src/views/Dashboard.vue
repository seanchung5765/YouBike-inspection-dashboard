<template>
  <div class="dashboard-wrapper">
    <!-- 🌟 加上 id="tour-tabs-area" 讓導覽尋找 -->
    <el-tabs id="tour-tabs-area" v-model="activeTab" type="border-card" class="dashboard-tabs">
      
      <el-tab-pane label="維護狀況評估表" name="summary">
        <SummaryDashboard />
      </el-tab-pane>
      
      <el-tab-pane label="維護指標統計表" name="issues">
        <CityIssueReport />
      </el-tab-pane>
      
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import SummaryDashboard from './report/SummaryDashboard.vue'
import CityIssueReport from './report/CityIssueReport.vue'
import { startTour } from '../utils/tour' // 🌟 引入導覽工具

const activeTab = ref('summary')

onMounted(() => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const roleLevel = parseInt(user.role_level || 0);

  const steps = [
    { element: '#tour-font-size', popover: { title: '1. 字型大小友善', description: '調節畫面字體大小，人性化閱覽' } },
    { element: '#tour-nav-menu', popover: { title: '2. 功能表單', description: '系統設定及資料統計' } },
    { element: '#tour-tabs-area', popover: { title: '3. 維護統計量表', description: '維護狀況及指標統計查閱' } },
    { element: '#tour-main-table', popover: { title: '4. 維護量表', description: '維護評量及指標統計查閱' } }
  ];

  // 高階管理員專屬步驟
  if (roleLevel >= 90) {
    steps.push({ element: '#tour-recalc-btn', popover: { title: '5. 重新結算', description: '資料重新上傳未發布前，可經由重新結算預覽評分' } });
  }

  startTour(`tour_dashboard_${user.id}`, steps);
})
</script>

<style scoped>
.dashboard-wrapper {
  width: 100%;
}

:deep(.el-tabs__content) {
  padding: 15px 0 0 0;
  background-color: transparent;
}

@media (max-width: 768px) {
  :deep(.el-tabs__item) {
    font-size: 13px;
    padding: 0 10px;
  }
}
</style>