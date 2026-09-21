<!--D:\web_project\P2026_6模擬體驗後台\程式碼\YouBike-inspection-dashboard\frontend\src\components\admin\AddUserDialog.vue-->
<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '編輯系統授權人員' : '新增系統授權人員'"
    :width="isMobile ? '95%' : '600px'"
    @close="resetForm"
  >
    <el-form :model="addForm" :label-position="isMobile ? 'top' : 'right'" :label-width="isMobile ? 'auto' : '110px'" v-loading="loadingOptions">
      
      <el-form-item :label="isEdit ? '授權員工' : '搜尋員工'" required>
        <el-select
          v-if="!isEdit"
          v-model="selectedEmployee"
          filterable remote reserve-keyword
          placeholder="請輸入工號或姓名"
          :remote-method="handleLdapSearch"
          :loading="ldapLoading"
          value-key="emp_id" 
          style="width: 100%"
        >
          <!-- 🌟 將 label 從 `${item.emp_id} - ${item.name} (${item.department})` 改成下面這樣 -->
          <el-option
            v-for="item in ldapOptions" :key="item.emp_id"
            :label="`${item.emp_id} - ${item.name}`"
            :value="item"
          />
        </el-select>
        <el-input v-else :value="`${addForm.name} (${addForm.emp_id})`" disabled />
      </el-form-item>

      <el-form-item label="所屬單位" required>
        <el-select v-model="addForm.unit_id" placeholder="請選擇單位" style="width: 100%">
          <el-option v-for="unit in optionsData?.units" :key="unit.id" :label="unit.name" :value="unit.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="系統角色" required>
        <el-select v-model="addForm.back_role_id" placeholder="請選擇系統角色" style="width: 100%">
          <el-option v-for="role in optionsData?.backRoles" :key="role.id" :label="role.name" :value="role.id" />
        </el-select>
      </el-form-item>

      <el-form-item label="前台角色" required>
        <el-select v-model="addForm.front_role_id" placeholder="請選擇前台角色" style="width: 100%">
          <el-option v-for="role in optionsData?.frontRoles" :key="role.id" :label="role.name" :value="role.id" />
        </el-select>
      </el-form-item>
      
      <el-form-item label="閱覽地區">
        <el-select v-model="addForm.view_regions" multiple placeholder="請選擇地區 (可複選)" style="width: 100%">
          <el-option v-for="region in optionsData?.regions" :key="region.id" :label="region.name" :value="region.id" />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="submitAddUser">
          {{ isEdit ? '確認修改' : '確認新增' }}
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, onUnmounted, defineExpose, defineEmits } from 'vue'
import { ElMessage } from 'element-plus'
import { searchLdapAPI } from '../../api/ldap'
import { addPermissionsAPI, updatePermissionsAPI } from '../../api/users'
import { getSystemOptionsAPI } from '../../api/system' 

const emit = defineEmits(['success'])
const visible = ref(false)
const isEdit = ref(false) 
const currentUserId = ref(null) 

const loadingOptions = ref(false)
const optionsData = ref({ units: [], regions: [], frontRoles: [], backRoles: [] })

const ldapLoading = ref(false)
const ldapOptions = ref([])
const selectedEmployee = ref(null)

const addForm = ref({ emp_id: '', name: '', unit_id: '', back_role_id: '', front_role_id: '', view_regions: [] })

// 🌟 手機版偵測
const isMobile = ref(false);
const checkMobile = () => { isMobile.value = window.innerWidth <= 768; }

onMounted(() => { checkMobile(); window.addEventListener('resize', checkMobile); })
onUnmounted(() => { window.removeEventListener('resize', checkMobile); })

const fetchOptions = async () => {
  loadingOptions.value = true
  try {
    const res = await getSystemOptionsAPI()
    if (res.data?.success) optionsData.value = res.data.data
  } catch (error) {
    ElMessage.error('無法載入系統選項')
  } finally { loadingOptions.value = false }
}

const resetForm = () => {
  selectedEmployee.value = null; ldapOptions.value = [];
  addForm.value = { unit_id: '', back_role_id: '', front_role_id: '', view_regions: [] }
}

const handleLdapSearch = async (query) => {
  if (query) {
    ldapLoading.value = true
    try {
      const res = await searchLdapAPI(query)
      if (res.data.success) ldapOptions.value = res.data.data
    } catch (error) {} finally { ldapLoading.value = false }
  } else { ldapOptions.value = [] }
}

const submitAddUser = async () => {
  if (!isEdit.value && !selectedEmployee.value) return ElMessage.warning('請先搜尋並選擇員工！')
  if (!addForm.value.back_role_id || !addForm.value.unit_id) return ElMessage.warning('請選擇後台角色與單位！')
  if (!addForm.value.front_role_id) return ElMessage.warning('請選擇前台角色！')
  
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const payload = {
    unit_id: addForm.value.unit_id, back_role_id: addForm.value.back_role_id,
    front_role_id: addForm.value.front_role_id, view_regions: addForm.value.view_regions, operator_id: currentUser.id
  }

  try {
    if (isEdit.value) {
      payload.name = addForm.value.name
      const res = await updatePermissionsAPI(currentUserId.value, payload)
      if (res.data.success) { ElMessage.success('修改成功！'); visible.value = false; emit('success') }
    } else {
      payload.emp_id = selectedEmployee.value.emp_id
      payload.name = selectedEmployee.value.name
      const res = await addPermissionsAPI(payload)
      if (res.data.success) { ElMessage.success('新增成功！'); visible.value = false; emit('success') }
    }
  } catch (error) { ElMessage.error(error.response?.data?.message || '操作失敗') }
}

const open = (mode = 'add', rowData = null) => {
  visible.value = true
  isEdit.value = mode === 'edit'
  if (optionsData.value.units.length === 0) fetchOptions()

  if (isEdit.value && rowData) {
    currentUserId.value = rowData.id
    addForm.value = {
      emp_id: rowData.emp_id, name: rowData.name, unit_id: rowData.unit_id,
      back_role_id: rowData.back_role_id, front_role_id: rowData.front_role_id || '',
      view_regions: rowData.view_regions_ids ? rowData.view_regions_ids.split(',').map(Number) : []
    }
  } else { resetForm() }
}
defineExpose({ open })
</script>