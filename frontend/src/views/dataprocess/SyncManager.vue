<template>
  <div class="import-container">
    <h2>每月資料</h2>
    
    <!-- 🌟 將綁定的 data 改為 displayTableData -->
    <el-table :data="displayTableData" style="width: 100%" v-loading="loading">
      
      <el-table-column label="項目 (月份)" prop="report_month" width="220">
        <template #default="scope">
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <div>
              <span style="font-weight: bold; font-size: 1.1em;">{{ scope.row.report_month }}</span>
              
              <!-- 🌟 一般使用者不需要看狀態標籤（因為他們看到的都是已發布），所以加上 v-if="isAdmin" -->
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

      <!-- 🌟 新增 v-if="isAdmin"：只有管理員看得到最後載入時間 -->
      <el-table-column v-if="isAdmin" label="最後載入時間" width="180">
        <template #default="scope">
          <span style="color: #909399; font-size: 0.9em;">
            {{ scope.row.last_sync_time ? formatDateTime(scope.row.last_sync_time) : '尚未載入' }}
          </span>
        </template>
      </el-table-column>
      
      <el-table-column label="操作項目" align="right" min-width="450">
        <template #default="scope">
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            
            <!-- 🌟 新增 v-if="isAdmin" -->
            <el-button 
              v-if="isAdmin"
              type="success" link
              :disabled="scope.row.status === 'published' || syncTarget !== null"
              @click="handleSync(scope.row)"
            >
              <el-icon v-if="syncTarget === scope.row.report_month" class="is-loading" style="margin-right: 5px;"><Refresh /></el-icon>
              {{ syncTarget === scope.row.report_month ? '資料載入中...' : '從模擬體驗載入資料' }}
            </el-button>
            <!-- 🌟 大家都看得到匯出 Excel，不需要 v-if -->
            <el-button type="info" link @click="handleExport(scope.row.report_month)" :disabled="syncTarget !== null">
              <el-icon><Download style="margin-right: 5px;"/></el-icon> 匯出 Excel
            </el-button>

            <!-- 🌟 新增 v-if="isAdmin" -->
            <el-upload
              v-if="isAdmin"
              action=""
              :auto-upload="false"
              :show-file-list="false"
              accept=".xlsx, .xls"
              :on-change="(file) => handleImportExcel(file, scope.row)"
            >
              <el-button type="primary" link :disabled="scope.row.status === 'published' || syncTarget !== null">
                <el-icon><Upload style="margin-right: 5px;"/></el-icon> 匯入 Excel
              </el-button>
            </el-upload>
            
            <!-- 🌟 新增 v-if="isAdmin" -->
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
// 🌟 記得引入 computed
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Upload, Refresh } from '@element-plus/icons-vue'

import { exportMonthDataToExcel } from '../../utils/exportExcel'
import { parseBikeExcel } from '../../utils/importExcel' 
import { batchUpdateBikesAPI } from '../../api/dataProcess'
import { getMonthlyReportsAPI, syncMonthlyDataAPI, publishMonthlyReportAPI } from '../../api/sync' 
import { getScoringRulesAPI } from '../../api/scoring'

const tableData = ref([])
const loading = ref(false)

const syncTarget = ref(null)
const syncProgress = ref(0)

// 🌟 1. 取得當前使用者權限
const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
const isAdmin = computed(() => currentUser.role_level >= 90);

// 🌟 2. 依照權限過濾表格資料
const displayTableData = computed(() => {
  if (isAdmin.value) {
    return tableData.value; // 管理員看全部
  }
  // 非管理員只看已發布
  return tableData.value.filter(row => row.status === 'published');
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

const handleExport = (month) => exportMonthDataToExcel(month)

const handleSync = async (row) => {
  const month = row.report_month
  if (row.status === 'draft') {
    try {
      await ElMessageBox.confirm(
        `${month} 已經有資料存在，重新載入將會「完全覆蓋」您現有的修改內容，確定要繼續嗎？`,
        '覆蓋警告',
        { confirmButtonText: '確定覆蓋', cancelButtonText: '取消', type: 'warning' }
      )
    } catch {
      return 
    }
  }

  syncTarget.value = month;
  syncProgress.value = 0;
  
  const timer = setInterval(() => {
    if (syncProgress.value < 90) {
      syncProgress.value += Math.floor(Math.random() * 15) + 5;
      if (syncProgress.value > 90) syncProgress.value = 90;
    }
  }, 400);

  try {
    const operatorId = currentUser.username || 'System'
    
    await syncMonthlyDataAPI({ month, operator_id: operatorId })
    
    clearInterval(timer);
    syncProgress.value = 100;

    setTimeout(() => {
      ElMessage.success(`${month} 資料載入成功！`)
      syncTarget.value = null; 
      fetchList() 
    }, 600);

  } catch (error) {
    clearInterval(timer);
    syncTarget.value = null;
    ElMessage.error('資料載入失敗！');
  } 
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

onMounted(fetchList)
</script>

<style scoped>
.import-container { padding: 20px; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1); }
h2 { margin-top: 0; margin-bottom: 20px; color: #303133; }
:deep(.el-progress-bar__inner) { transition: width 0.3s ease; }
</style>