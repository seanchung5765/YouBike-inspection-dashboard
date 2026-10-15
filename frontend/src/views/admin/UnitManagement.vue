<template>
  <div class="unit-management">
    <el-card>
      <template #header>
        <div class="header-container">
          <span>單位權限管理</span>
          <!-- 🌟 第一步：新增按鈕 -->
          <el-button id="tour-add-unit-btn" type="primary" icon="Plus" @click="handleAdd" class="mobile-full-btn">新增單位權限</el-button>
        </div>
      </template>

      <!-- 🌟 神奇透明圖層區：用來覆蓋整個直行 -->
      <div class="table-overlay-container">
        <!-- 對齊「單位名稱」欄位 (約佔 30% 寬度) -->
        <div id="tour-col-unit-name" class="overlay-col-1"></div>
        <!-- 對齊「閱覽地區」欄位 (約佔 40% 寬度) -->
        <div id="tour-col-regions" class="overlay-col-2"></div>

        <el-table :data="tableData" style="width: 100%" v-loading="loading" border stripe>
          <!-- 已經不需要 label-class-name 了，因為我們改框透明圖層 -->
          <el-table-column prop="unit_name" label="單位名稱" min-width="150" />
          
          <el-table-column label="閱覽地區" min-width="200">
            <template #default="scope">
              <el-tag 
                v-for="region in formatRegions(scope.row.allowed_regions_name)" 
                :key="region"
                size="small"
                class="region-tag"
              >
                {{ region }}
              </el-tag>
              <span v-if="!scope.row.allowed_regions_name" class="text-gray">尚未配置</span>
            </template>
          </el-table-column>

          <!-- 手機版自動解除 fixed 屬性，避免遮擋內容 -->
          <el-table-column label="操作" min-width="150" :fixed="isMobile ? false : 'right'">
            <template #default="scope">
              <el-button size="small" type="primary" plain @click="handleEdit(scope.row)">編輯</el-button>
              <el-button size="small" type="danger" plain @click="handleDelete(scope.row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <UnitDialog ref="unitDialogRef" @success="fetchUnits" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getUnitsAPI, deleteUnitAPI } from '../../api/units'
import { ElMessage, ElMessageBox } from 'element-plus'
import UnitDialog from '../../components/admin/UnitDialog.vue'
import { startTour } from '../../utils/tour' // 🌟 引入導覽工具

const tableData = ref([])
const loading = ref(false)
const unitDialogRef = ref(null)

// 手機版偵測邏輯
const isMobile = ref(false);
const checkMobile = () => { isMobile.value = window.innerWidth <= 768; }

const fetchUnits = async () => {
  loading.value = true
  try {
    const res = await getUnitsAPI()
    if (res.data.success) {
      tableData.value = res.data.data
    }
  } catch (error) {
    ElMessage.error('獲取單位列表失敗')
  } finally {
    loading.value = false
  }
}

const formatRegions = (regionsStr) => {
  return regionsStr ? regionsStr.split(', ') : []
}

const handleEdit = (row) => {
  if (unitDialogRef.value) {
    unitDialogRef.value.open('edit', row)
  }
}

const handleAdd = () => {
  if (unitDialogRef.value) {
    unitDialogRef.value.open('add')
  }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(
    `確定要刪除「${row.unit_name}」嗎？此動作無法復原！`,
    '警告',
    {
      confirmButtonText: '確定刪除',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    try {
      const res = await deleteUnitAPI(row.id)
      if (res.data.success) {
        ElMessage.success('單位已成功刪除')
        fetchUnits() 
      }
    } catch (error) {
      ElMessage.error(error.response?.data?.message || '刪除失敗，請聯絡管理員')
    }
  }).catch(() => {
    ElMessage.info('已取消刪除')
  })
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  fetchUnits()

  // 🌟 啟動導覽
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.role_level >= 50) { 
    startTour(`tour_unit_mgt_${user.id}`, [
      { element: '#tour-add-unit-btn', popover: { title: '1. 新增單位權限', description: '自定義建立閱覽群組' } },
      
      // 🌟 改為高亮我們放好的透明圖層
      { element: '#tour-col-unit-name', popover: { title: '2. 群組管理', description: '群組權限閱覽區域及群組管理', side: 'right', align: 'start' } },
      { element: '#tour-col-regions', popover: { title: '3. 閱覽權限管理', description: '人員閱覽權限設置', side: 'right', align: 'start' } }
    ]);
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.header-container { display: flex; justify-content: space-between; align-items: center; }
.region-tag { margin-right: 5px; margin-bottom: 5px; }
.text-gray { color: #909399; font-size: 0.85em; }

/* 強制 Element Plus 的標籤與按鈕跟隨全站字體縮放 */
:deep(.el-tag),
:deep(.el-button) {
  font-size: 1em;
}

:deep(.el-tag.el-tag--small),
:deep(.el-button.el-button--small) {
  font-size: 0.85em; 
}

/* 🌟 透明長條圖層定位設定 */
.table-overlay-container {
  position: relative;
}

/* 單位名稱欄位覆蓋 (佔比約 30%) */
.overlay-col-1 {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 30%;
  pointer-events: none; /* 穿透點擊 */
  z-index: 1;
}

/* 閱覽地區欄位覆蓋 (佔比約 40%) */
.overlay-col-2 {
  position: absolute;
  left: 30%; /* 緊接在第一個圖層右邊 */
  top: 0;
  bottom: 0;
  width: 40%;
  pointer-events: none;
  z-index: 1;
}

/* 📱 手機版排版 */
@media (max-width: 768px) {
  .unit-management { padding: 0; }
  .header-container { flex-direction: column; align-items: flex-start; gap: 15px; }
  .mobile-full-btn { width: 100%; margin-left: 0; }
  :deep(.el-card__header) { padding: 12px; font-weight: bold; }
  :deep(.el-card__body) { padding: 8px; }
  :deep(.el-table .cell) { padding: 0 5px; font-size: 0.9em; }
}
</style>