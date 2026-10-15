<template>
  <div id="tour-sync-container" class="import-container relative-container">
    <h2>每月資料</h2>
    
    <!-- 🌟 神奇的透明圖層：用來覆蓋整個右側的操作欄位 -->
    <div id="tour-sync-actions-area" class="actions-overlay-box"></div>
    
    <el-table :data="displayTableData" style="width: 100%" v-loading="loading">
      
      <el-table-column label="月份" prop="report_month" width="220">
        <template #default="scope">
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <div>
              <span style="font-weight: bold; font-size: 1.1em;">{{ scope.row.report_month }}</span>
              
              <template v-if="isAdmin">
                <span v-if="scope.row.status === 'draft'" style="color: #F56C6C; margin-left: 10px; font-size: 0.9em;">(編修中)</span>
                <span v-if="scope.row.status === 'published'" style="color: #67C23A; margin-left: 10px; font-size: 0.9em;">(已發布)</span>
              </template>
            </div>
            
            <el-progress 
              v-if="syncTarget === scope.row.report_month" 
              :percentage="syncProgress" 
              :status="syncProgress === 100 ? 'success' : ''" 
              :stroke-width="8" 
              style="width: 90%;"
            />
          </div>
        </template>
      </el-table-column>

      <el-table-column v-if="isAdmin" label="最後載入時間" width="180">
        <template #default="scope">
          <span style="color: #909399; font-size: 0.9em;">
            {{ scope.row.last_sync_time ? formatDateTime(scope.row.last_sync_time) : '尚未載入' }}
          </span>
        </template>
      </el-table-column>
      
      <!-- 🌟 操作項目表頭加上問號提示 -->
      <el-table-column align="right" min-width="450">
        <template #header>
          <div style="display: inline-flex; align-items: center; justify-content: flex-end; width: 100%;">
            操作項目
            <el-tooltip effect="dark" placement="top">
              <template #content>
                <div style="line-height: 1.5;">
                  下載報表：每月報表下載<br />
                  匯出明細：系統中樣本資料下載<br />
                  <template v-if="isAdmin">
                    匯入明細：更新系統中樣本<br />
                    <span style="color: #F56C6C;">注意：上傳後樣本資料被覆蓋不可復原，請注意存儲</span><br />
                    鎖定發布：經發布後資料則對外公示不可修改
                  </template>
                </div>
              </template>
              <el-icon style="margin-left: 4px; cursor: help; vertical-align: middle;"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </template>
        <template #default="scope">
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <el-button 
              v-if="isMiddleManager && (scope.row.status === 'published' || isAdmin)"
              type="warning" link 
              @click="handleDownloadReport(scope.row.report_month)" 
              :disabled="syncTarget !== null"
            >
              <el-icon><Document style="margin-right: 5px;"/></el-icon> 下載報表
            </el-button>

            <el-button type="info" link @click="handleExport(scope.row.report_month, scope.row.status)" :disabled="syncTarget !== null">
              <el-icon><Download style="margin-right: 5px;"/></el-icon> 匯出明細
            </el-button>

            <el-upload
              v-if="isAdmin"
              action=""
              :auto-upload="false"
              :show-file-list="false"
              accept=".xlsx, .xls"
              :on-change="(file) => handleImportExcel(file, scope.row)"
            >
              <el-button type="primary" link :disabled="scope.row.status === 'published' || syncTarget !== null">
                <el-icon><Upload style="margin-right: 5px;"/></el-icon> 匯入明細
              </el-button>
            </el-upload>
            
            <el-button 
              v-if="isAdmin && scope.row.status === 'draft'"
              type="primary" link
              :disabled="syncTarget !== null"
              @click="handlePublish(scope.row.report_month)"
            >
              鎖定發布
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Upload, Refresh, Document, QuestionFilled } from '@element-plus/icons-vue' // 🌟 記得引入 QuestionFilled

import { exportMonthDataToExcel } from '../../utils/exportExcel'
import { parseBikeExcel } from '../../utils/importExcel' 
import { batchUpdateBikesAPI } from '../../api/dataProcess'
import { getMonthlyReportsAPI, syncMonthlyDataAPI, publishMonthlyReportAPI } from '../../api/sync' 
import { getScoringRulesAPI } from '../../api/scoring'
import { exportMonthlyReportToExcel } from '../../utils/exportReport'
import { startTour } from '../../utils/tour'

const tableData = ref([])
const loading = ref(false)

const syncTarget = ref(null)
const syncProgress = ref(0)

const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
const isAdmin = computed(() => currentUser.role_level >= 90);
const isMiddleManager = computed(() => currentUser.role_level >= 50);

const displayTableData = computed(() => {
  return tableData.value; 
});
const fetchList = async () => {
  loading.value = true
  try {
    const res = await getMonthlyReportsAPI()
    if (res.data.success) {
      tableData.value = res.data.data
    }
  } catch (error) {} 
  finally { loading.value = false }
}

const handleDownloadReport = (month) => {
  exportMonthlyReportToExcel(month);
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mins}`;
}

const handleExport = (month, status) => {
  exportMonthDataToExcel(month, status);
}

const handlePublish = async (month) => {
  try {
    await ElMessageBox.confirm(`確定要發布 ${month} 的報表嗎？發布後將無法再修改！`, '鎖定發布', { 
      confirmButtonText: '確定發布', cancelButtonText: '取消', type: 'warning' 
    })
    loading.value = true
    await publishMonthlyReportAPI({ month })
    ElMessage.success(`${month} 已成功鎖定發布！`)
    fetchList()
  } catch (error) {} 
  finally { loading.value = false }
}

const handleImportExcel = async (file, row) => {
  const month = row.report_month
  try {
    await ElMessageBox.confirm(
      `上傳 Excel 將會「完全覆蓋」系統內 ${month} 的資料！\n(Excel 內若刪除了某些列，系統也會同步刪除)。確定要匯入嗎？`,
      '匯入覆蓋確認',
      { confirmButtonText: '確定', cancelButtonText: '取消', type: 'danger' }
    )
    
    syncTarget.value = month;
    syncProgress.value = 0;
    const timer = setInterval(() => {
      if (syncProgress.value < 90) syncProgress.value += Math.floor(Math.random() * 10) + 2;
    }, 300);

    const rulesRes = await getScoringRulesAPI()
    if (!rulesRes.data.success) throw new Error("無法取得計分規則")
    const rulesDictionary = rulesRes.data.data;

    const { bikeUpdates, stationUpdates } = await parseBikeExcel(file.raw, rulesDictionary)
    if (bikeUpdates.length === 0) throw new Error("解析出的資料為空")

    const allValidIds = bikeUpdates.map(u => u.id);
    const chunkSize = 200
    for (let i = 0; i < bikeUpdates.length; i += chunkSize) {
      const chunk = bikeUpdates.slice(i, i + chunkSize)
      await batchUpdateBikesAPI({ 
        month, updates: chunk, 
        stationUpdates: i === 0 ? stationUpdates : [], 
        isFirstChunk: i === 0, 
        allValidIds: i === 0 ? allValidIds : [] 
      })
    }
    
    clearInterval(timer);
    syncProgress.value = 100;
    setTimeout(() => {
      ElMessage.success('匯入更新成功！')
      syncTarget.value = null;
      fetchList()
    }, 600);

  } catch (err) {
    if (err !== 'cancel') {
      console.error(err)
      syncTarget.value = null;
      ElMessage.error('匯入失敗: ' + err.message)
    }
  }
}

onMounted(() => {
  fetchList();

  let actionDescription = '下載報表：每月報表下載\n匯出明細：系統中樣本資料下載';

  if (currentUser.role_level >= 90) {
    actionDescription += '\n匯入明細：更新系統中樣本 (上傳後被覆蓋不可復原)\n鎖定發布：經發布後資料對外公示不可修改';
  }

  startTour(`tour_sync_${currentUser.id}`, [
    { 
      element: '#tour-sync-container', 
      popover: { 
        title: '1. 樣本資料', 
        description: '每月樣本資料下載 / 處理後資料上傳 / 報表下載' 
      } 
    },
    { 
      element: '#tour-sync-actions-area', 
      popover: { 
        title: '?. 操作說明', 
        description: actionDescription, 
        side: 'left',
        align: 'start'
      } 
    }
  ]);
})
</script>

<style scoped>
.import-container { padding: 20px; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1); }
h2 { margin-top: 0; margin-bottom: 20px; color: #303133; }
:deep(.el-progress-bar__inner) { transition: width 0.3s ease; }

.relative-container {
  position: relative;
}

.actions-overlay-box {
  position: absolute;
  top: 60px;       
  right: 20px;     
  width: 480px;    
  bottom: 20px;    
  pointer-events: none; 
  z-index: 1;      
}
</style>