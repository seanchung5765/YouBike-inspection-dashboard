<template>
  <div class="photo-viewer-container" v-loading="loading">
    
    <!-- 🌟 頂部資訊區：加入車號與日期 -->
    <div class="header">
      <h2>📸 巡檢照片</h2>
      <div class="info-tags" v-if="bikeNo || checkDate">
        <el-tag size="large" type="primary" effect="dark" class="info-tag">
          <el-icon style="margin-right: 5px;"><Bicycle /></el-icon> 車號：{{ bikeNo }}
        </el-tag>
        <el-tag size="large" type="info" effect="plain" class="info-tag">
          <el-icon style="margin-right: 5px;"><Calendar /></el-icon> 巡檢日期：{{ checkDate }}
        </el-tag>
      </div>
    </div>
    
    <div v-if="!loading && photoList.length === 0" class="empty-state">
      <el-empty description="找不到此紀錄的照片，或照片已被移除" />
    </div>

    <!-- 🌟 照片展示區：改為左右排列 -->
    <div v-else class="gallery">
      <div v-for="(photo, index) in photoList" :key="index" class="image-wrapper">
        <el-image 
          :src="photo.url" 
          :preview-src-list="photoList.map(p => p.url)"
          :initial-index="index"
          fit="contain"
          class="viewer-image"
        />
        <!-- 可以在照片下方顯示檔名，若不需要可刪除 -->
        <div class="photo-name">{{ photo.name }}</div>
      </div>
    </div>
    
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Bicycle, Calendar } from '@element-plus/icons-vue' // 引入 Icon
import { getDefectPhotosAPI } from '../api/defect' 

const route = useRoute()
const loading = ref(true)
const photoList = ref([])

// 準備接收網址上的資訊
const bikeNo = ref('')
const checkDate = ref('')

onMounted(async () => {
  const recordId = route.query.id
  
  // 🌟 從網址把剛才 Excel 塞進來的車號跟日期抓出來顯示
  bikeNo.value = route.query.bike || '未知車號'
  checkDate.value = route.query.date || '未知日期'
  
  if (!recordId) {
    loading.value = false
    return ElMessage.error('無效的連結參數')
  }

  try {
    const res = await getDefectPhotosAPI(recordId)
    if (res.data.success) {
      photoList.value = res.data.data
    }
  } catch (error) {
    ElMessage.error('無法載入照片，請確認網路或權限')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.photo-viewer-container {
  min-height: 100vh;
  background-color: #f0f3f6;
  padding: 40px 20px;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 40px;
}

.header h2 {
  color: #0f172a;
  margin-bottom: 15px;
  font-size: 26px;
  letter-spacing: 1px;
}

.info-tags {
  display: flex;
  justify-content: center;
  gap: 15px;
}

.info-tag {
  font-size: 15px;
  padding: 8px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
}

/* 🌟 核心排版：左右並列，裝不下自動換行 */
.gallery {
  display: flex;
  flex-direction: row; 
  flex-wrap: wrap;     
  justify-content: center; 
  align-items: flex-start;
  gap: 30px;
  max-width: 1200px; /* 限制最大寬度，讓大螢幕看起來不會太散 */
  margin: 0 auto;
}

/* 每個照片的獨立外框 */
.image-wrapper {
  background-color: #ffffff;
  padding: 15px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 限制單張照片的尺寸 */
.viewer-image {
  width: 320px; 
  height: 240px; 
  border-radius: 6px;
  background-color: #fafafa;
  cursor: zoom-in;
}

.photo-name {
  margin-top: 12px;
  font-size: 13px;
  color: #94a3b8;
  word-break: break-all;
  max-width: 300px;
  text-align: center;
}

/* 手機版適應：畫面太小時變成單欄上下排 */
@media (max-width: 600px) {
  .viewer-image {
    width: 100%;
    height: auto;
    min-height: 200px;
  }
  .image-wrapper {
    width: 100%;
  }
}
</style>