<template>
  <el-dialog :title="isEdit ? '編輯閱覽權限' : '新增閱覽權限'" v-model="visible" :width="isMobile ? '95%' : '500px'">
    <el-form :model="formData" :label-position="isMobile ? 'top' : 'right'" :label-width="isMobile ? 'auto' : '80px'">
      
      <el-form-item label="人員" v-if="!isEdit">
        <el-select v-model="formData.emp_id" filterable remote reserve-keyword placeholder="請輸入工號或姓名" :remote-method="searchLdap" :loading="searching" @change="handleUserSelect" style="width: 100%">
          <el-option v-for="item in userOptions" :key="item.emp_id" :label="`${item.name} (${item.emp_id}) - ${item.department || '無單位'}`" :value="item.emp_id" />
        </el-select>
      </el-form-item>
      
      <el-form-item label="人員" v-else>
        <el-input v-model="currentUserName" disabled />
      </el-form-item>

      <el-form-item label="閱覽地區">
        <el-select v-model="formData.region_ids" multiple placeholder="請選擇地區群組" style="width: 100%">
          <el-option v-for="reg in regionOptions" :key="reg.id" :label="reg.name" :value="reg.id" />
        </el-select>
      </el-form-item>
    </el-form>
    
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="submit" :loading="submitting">確定儲存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { searchLdapAPI } from '../../api/ldap'
import { getUnitAllowedRegionsAPI, getViewersAPI, getEligibleUsersAPI, addViewerAPI, updateViewerAPI } from '../../api/viewers'

const emit = defineEmits(['success'])
const excludeEmpIds = ref([])
const visible = ref(false)
const isEdit = ref(false)
const userOptions = ref([])
const regionOptions = ref([])
const currentUserName = ref('')
const submitting = ref(false)
const searching = ref(false)

const formData = ref({ emp_id: null, name: '', region_ids: [] })
const hiddenRegionIds = ref([])
let currentUser = {}

// 🌟 手機版偵測
const isMobile = ref(false);
const checkMobile = () => { isMobile.value = window.innerWidth <= 768; }

onMounted(() => { checkMobile(); window.addEventListener('resize', checkMobile); })
onUnmounted(() => { window.removeEventListener('resize', checkMobile); })

const open = async (mode, row = null) => {
  visible.value = true
  isEdit.value = mode === 'edit'
  formData.value = { emp_id: null, name: '', region_ids: [] }; userOptions.value = []; regionOptions.value = [];
  
  const userString = localStorage.getItem('user')
  if (!userString) return ElMessage.error('請先登入')
  currentUser = JSON.parse(userString)

  try {
    const resReg = await getUnitAllowedRegionsAPI(currentUser.id)
    if (resReg.data.success) regionOptions.value = resReg.data.data

    if (isEdit.value) {
      currentUserName.value = row.name
      const allUserRegions = row.view_regions_ids ? String(row.view_regions_ids).split(',').map(Number) : []
      const allowedRegionIds = regionOptions.value.map(r => Number(r.id))
      formData.value = { user_id: row.id, region_ids: allUserRegions.filter(id => allowedRegionIds.includes(id)) }
      hiddenRegionIds.value = allUserRegions.filter(id => !allowedRegionIds.includes(id))
    } else {
      const resViewers = await getViewersAPI({ unit_id: currentUser.unit_id, role_level: currentUser.role_level, user_id: currentUser.id })
      if (resViewers.data.success) {
        excludeEmpIds.value = resViewers.data.data.map(v => v.emp_id)
        excludeEmpIds.value.push(currentUser.emp_id)
      }
    }
  } catch (e) { ElMessage.error('載入失敗') }
}

const searchLdap = async (query) => {
  if (query) {
    searching.value = true
    try {
      const res = await searchLdapAPI(query) 
      if (res.data.success) userOptions.value = res.data.data.filter(u => !excludeEmpIds.value.includes(u.emp_id))
    } catch (e) {} finally { searching.value = false }
  } else { userOptions.value = [] }
}

const handleUserSelect = (val) => {
  const selectedUser = userOptions.value.find(u => u.emp_id === val)
  if (selectedUser) formData.value.name = selectedUser.name
}

const submit = async () => {
  if ((!isEdit.value && !formData.value.emp_id) || formData.value.region_ids.length === 0) return ElMessage.warning('人員與地區不可為空')
  submitting.value = true
  try {
    const finalRegionIds = [...formData.value.region_ids, ...hiddenRegionIds.value]
    const payload = { ...formData.value, region_ids: finalRegionIds, operator_id: currentUser.id }
    if (isEdit.value) await updateViewerAPI(formData.value.user_id, payload)
    else await addViewerAPI(payload)
    ElMessage.success('操作成功'); visible.value = false; emit('success')
  } catch (e) { ElMessage.error('儲存失敗') } finally { submitting.value = false }
}
defineExpose({ open })
</script>