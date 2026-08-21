<template>
  <div class="unit-management">
    <el-card>
      <template #header>
        <div class="header-container">
          <span>單位權限管理</span>
          <el-button type="primary" icon="Plus" @click="handleAdd" class="mobile-full-btn">新增單位權限</el-button>
        </div>
      </template>

      <el-table :data="tableData" style="width: 100%" v-loading="loading" border stripe>
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

        <!-- 🌟 手機版自動解除 fixed 屬性，避免遮擋內容 -->
        <el-table-column label="操作" min-width="150" :fixed="isMobile ? false : 'right'">
          <template #default="scope">
            <el-button size="small" type="primary" plain @click="handleEdit(scope.row)">編輯</el-button>
            <el-button size="small" type="danger" plain @click="handleDelete(scope.row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <UnitDialog ref="unitDialogRef" @success="fetchUnits" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getUnitsAPI, deleteUnitAPI } from '../../api/units'
import { ElMessage, ElMessageBox } from 'element-plus'
import UnitDialog from '../../components/admin/UnitDialog.vue'

const tableData = ref([])
const loading = ref(false)
const unitDialogRef = ref(null)

// 🌟 手機版偵測邏輯
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
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.header-container { display: flex; justify-content: space-between; align-items: center; }
.region-tag { margin-right: 5px; margin-bottom: 5px; }
.text-gray { color: #909399; font-size: 0.85em; }

/* 🌟 強制 Element Plus 的標籤與按鈕跟隨全站字體縮放 */
:deep(.el-tag),
:deep(.el-button) {
  font-size: 1em;
}

/* 針對 size="small" 的元件微調比例 */
:deep(.el-tag.el-tag--small),
:deep(.el-button.el-button--small) {
  font-size: 0.85em; 
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