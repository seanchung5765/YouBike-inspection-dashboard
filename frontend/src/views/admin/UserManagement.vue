<template>
  <div id="tour-user-mgt-container" class="user-management">
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

      <div class="table-overlay-container">
        <div id="tour-col-unit" class="overlay-col-unit"></div>
        <div id="tour-col-region" class="overlay-col-region"></div>
        <div id="tour-col-front" class="overlay-col-front"></div>
        <div id="tour-col-sys" class="overlay-col-sys"></div>

        <el-table :data="tableData" style="width: 100%" v-loading="loading" border stripe>
          <el-table-column prop="emp_id" label="工號" min-width="100" />
          <el-table-column prop="name" label="姓名" min-width="100" />
          
          <el-table-column label="群組" min-width="120">
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

          <!-- 🌟 前台角色：加入 <br /> 強制換行 -->
          <el-table-column min-width="130">
            <template #header>
              前台角色
              <el-tooltip effect="dark" placement="top">
                <template #content>
                  <div style="line-height: 1.5;">
                    營運處：營運自檢分數<br />
                    執行專員：績效檢驗分數
                  </div>
                </template>
                <el-icon style="margin-left: 4px; cursor: help; vertical-align: middle;"><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>
            <template #default="scope">
              <el-tag :type="getFrontRoleTagType(scope.row.front_role_name)" effect="plain" size="small">
                {{ scope.row.front_role_name || '無角色' }}
              </el-tag>
            </template>
          </el-table-column>

          <!-- 🌟 系統角色：加入 <br /> 強制換行 -->
          <el-table-column prop="role_name" min-width="130">
            <template #header>
              系統角色
              <el-tooltip effect="dark" placement="top">
                <template #content>
                  <div style="line-height: 1.5;">
                    系統維運人員：系統最高使用權限人員<br />
                    業務維運人員：設置營運處主管及主任，可設定群組內之資料檢視人員<br />
                    資料檢視人員：業務維運人員設定閱覽系統資料之人員
                  </div>
                </template>
                <el-icon style="margin-left: 4px; cursor: help; vertical-align: middle;"><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>
            <template #default="scope">
              <el-tag :type="getSysRoleTagType(scope.row.role_name)" size="small">
                {{ scope.row.role_name || '無角色' }}
              </el-tag>
            </template>
          </el-table-column>

          <!-- 手機版自動解除 fixed 屬性 -->
          <el-table-column label="操作" min-width="140" :fixed="isMobile ? false : 'right'">
            <template #default="scope">
              <el-button size="small" type="primary" plain @click="handleEdit(scope.row)">編輯</el-button>
              <el-button size="small" type="danger" plain @click="handleDelete(scope.row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table> 
      </div>

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
import { QuestionFilled } from '@element-plus/icons-vue' 
import { getUsersAPI, deleteUserAPI } from '../../api/users'
import AddUserDialog from '../../components/admin/AddUserDialog.vue'
import { startTour } from '../../utils/tour' 

const tableData = ref([])
const loading = ref(false)
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const totalUsers = ref(0)

const isMobile = ref(false);
const checkMobile = () => { isMobile.value = window.innerWidth <= 768; }

const getFrontRoleTagType = (roleName) => {
  const role = (roleName || '').trim(); 
  switch (role) {
    case '營運處': return 'success';     
    case '執行專員': return 'warning';   
    default: return 'info';             
  }
}

const getSysRoleTagType = (roleName) => {
  const role = (roleName || '').trim(); 
  switch (role) {
    case '系統維運人員': return 'danger';    
    case '業務維運人員': return 'primary';   
    case '資料檢視人員': return 'info';      
    default: return 'info';                 
  }
}

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

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.role_level >= 50) { 
    startTour(`tour_user_mgt_${user.id}`, [
      { 
        element: '#tour-user-mgt-container', 
        popover: { 
          title: '1. 人員管理(僅系統維運人員可視)', 
          description: '個別設置人員前台數據歸屬及閱覽群組' 
        } 
      },
      { element: '#tour-col-unit', popover: { title: '2. 群組', description: '依群組設置\n劃歸可閱覽區域' } },
      { element: '#tour-col-region', popover: { title: '3. 閱覽地區', description: '依群組設置\n選擇可閱覽區域' } },
      { element: '#tour-col-front', popover: { title: '4. 前台角色', description: '設置人員前台輸入之數據資料評分歸屬\n營運處：營運自檢分數\n執行專員：績效檢驗分數' } },
      { element: '#tour-col-sys', popover: { title: '5. 系統角色', description: '設置人員系統使用及可視功能\n系統維運人員：最高使用權限\n業務維運人員：設置營運處主管及主任\n資料檢視人員：設定閱覽系統資料之人員' } }
    ]);
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.header-container { display: flex; justify-content: space-between; align-items: center; }
.search-bar { display: flex; align-items: center; }
.mobile-search-input { width: 300px; margin-right: 10px; }

:deep(.el-tag),
:deep(.el-button) {
  font-size: 1em;
}

:deep(.el-tag.el-tag--small),
:deep(.el-button.el-button--small) {
  font-size: 0.85em; 
}

.table-overlay-container {
  position: relative;
}

.overlay-col-unit {
  position: absolute; left: 23%; width: 14%; top: 0; bottom: 0; pointer-events: none; z-index: 1;
}
.overlay-col-region {
  position: absolute; left: 37%; width: 21%; top: 0; bottom: 0; pointer-events: none; z-index: 1;
}
.overlay-col-front {
  position: absolute; left: 58%; width: 13%; top: 0; bottom: 0; pointer-events: none; z-index: 1;
}
.overlay-col-sys {
  position: absolute; left: 71%; width: 13%; top: 0; bottom: 0; pointer-events: none; z-index: 1;
}

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