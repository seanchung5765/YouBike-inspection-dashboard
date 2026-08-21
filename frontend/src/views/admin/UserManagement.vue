<template>
  <div class="user-management">
    <el-card>
      <template #header>
        <div class="header-container">
          <span>人員權限管理</span>
          <el-button type="primary" icon="Plus" @click="openAddDialog" class="mobile-full-btn">新增人員權限</el-button>
        </div>
      </template>

      <div class="search-bar" style="margin-bottom: 20px;">
        <el-input
          v-model="searchQuery"
          placeholder="請輸入工號或姓名"
          class="mobile-search-input"
          clearable
          @clear="fetchUsers"
          @keyup.enter="fetchUsers"
        />
        <el-button type="primary" @click="fetchUsers" class="mobile-full-btn search-btn">查詢</el-button>
      </div>

      <el-table :data="tableData" style="width: 100%" v-loading="loading" border stripe>
        <el-table-column prop="emp_id" label="工號" min-width="100" />
        <el-table-column prop="name" label="姓名" min-width="100" />
        
        <el-table-column label="單位" min-width="120">
          <template #default="scope">
            <el-tag type="primary" effect="plain" v-if="scope.row.unit_name" size="small">
              {{ scope.row.unit_name }}
            </el-tag>
            <span v-else style="color: #909399; font-size: 0.85em;">無</span>
          </template>
        </el-table-column>
        
        <el-table-column label="閱覽地區" min-width="180">
          <template #default="scope">
            <template v-if="scope.row.view_regions_name">
              <el-tag 
                v-for="region in scope.row.view_regions_name.split(', ')" 
                :key="region"
                type="primary" 
                size="small"
                style="margin-right: 4px; margin-bottom: 4px;"
              >
                {{ region }}
              </el-tag>
            </template>
            <span v-else style="color: #909399; font-size: 0.85em;">無</span>
          </template>
        </el-table-column>

        <el-table-column label="前台角色" min-width="110">
          <template #default="scope">
            <el-tag type="info" effect="plain" size="small">
              {{ scope.row.front_role_name || '無角色' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="role_name" label="系統角色" min-width="110">
          <template #default="scope">
            <el-tag :type="scope.row.role_name === '高階管理員' ? 'danger' : 'info'" size="small">
              {{ scope.row.role_name || '無角色' }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 🌟 手機版自動解除 fixed 屬性 -->
        <el-table-column label="操作" min-width="140" :fixed="isMobile ? false : 'right'">
          <template #default="scope">
            <el-button size="small" type="primary" plain @click="handleEdit(scope.row)">編輯</el-button>
            <el-button size="small" type="danger" plain @click="handleDelete(scope.row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table> 

      <div class="pagination-container" style="margin-top: 20px; display: flex; justify-content: flex-end;">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :layout="isMobile ? 'total, prev, next' : 'total, sizes, prev, pager, next'"
          :total="totalUsers"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <AddUserDialog ref="dialogRef" @success="fetchUsers" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getUsersAPI, deleteUserAPI } from '../../api/users'
import AddUserDialog from '../../components/admin/AddUserDialog.vue'

const tableData = ref([])
const loading = ref(false)
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const totalUsers = ref(0)

// 🌟 手機版偵測邏輯
const isMobile = ref(false);
const checkMobile = () => { isMobile.value = window.innerWidth <= 768; }

const fetchUsers = async () => {
  loading.value = true
  try {
    const res = await getUsersAPI({
      page: currentPage.value,
      limit: pageSize.value,
      search: searchQuery.value
    })
    tableData.value = res.data.data
    totalUsers.value = res.data.total
  } catch (error) {
    ElMessage.error('無法獲取人員資料')
  } finally {
    loading.value = false
  }
}

const handleDelete = (row) => {
  ElMessageBox.confirm(
    `確定要刪除「${row.name}」嗎？此動作無法復原！`,
    '警告',
    { confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'warning' }
  ).then(async () => {
    try {
      const res = await deleteUserAPI(row.id)
      if (res.data.success) {
        ElMessage.success('刪除成功')
        fetchUsers() 
      }
    } catch (error) {
      ElMessage.error('刪除失敗')
    }
  })
}

const dialogRef = ref(null)
const handleEdit = (row) => {
  if (dialogRef.value) dialogRef.value.open('edit', row)
}
const openAddDialog = () => {
  if (dialogRef.value) dialogRef.value.open()
}

const handleSizeChange = (val) => { pageSize.value = val; fetchUsers() }
const handleCurrentChange = (val) => { currentPage.value = val; fetchUsers() }

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  fetchUsers()
})
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.header-container { display: flex; justify-content: space-between; align-items: center; }
.search-bar { display: flex; align-items: center; }
.mobile-search-input { width: 300px; margin-right: 10px; }
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
  .user-management { padding: 0; }
  .header-container { flex-direction: column; align-items: flex-start; gap: 15px; }
  .search-bar { flex-direction: column; gap: 10px; }
  .mobile-search-input { width: 100%; margin-right: 0; }
  .mobile-full-btn { width: 100%; margin-left: 0; }
  .search-btn { margin-left: 0 !important; }
  
  :deep(.el-card__header) { padding: 12px; font-weight: bold; }
  :deep(.el-card__body) { padding: 10px; }
  :deep(.el-table .cell) { padding: 0 5px; font-size: 0.9em; }
  .pagination-container { justify-content: center !important; }
}
</style>