import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export const startTour = (tourKey, steps) => {
  // 檢查 localStorage 是否已看過，看過就不再顯示
  if (localStorage.getItem(tourKey)) return;

  let clickAnywhereHandler = null;

  const driverObj = driver({
    animate: true,
    showProgress: false,
    
    // 🌟 加上這三行，把按鈕變成中文！
    nextBtnText: '下一步 ➔',
    prevBtnText: '⬅ 上一步',
    doneBtnText: '完成',
    
    // 把 showButtons 拿掉或設定預設顯示，讓按鈕正常出現
    showButtons: ['next', 'previous', 'close'], 
    allowClose: false, // 禁用 ESC 或點擊外部關閉
    
    steps: steps.map(step => ({
      ...step,
      popover: {
        ...step.popover,
        popoverClass: 'white-text-popover' 
      }
    })),
    onDestroyed: () => {
      if (clickAnywhereHandler) {
        document.removeEventListener('click', clickAnywhereHandler, true);
      }
      localStorage.setItem(tourKey, 'true'); // 紀錄已觀看
    }
  });

  // 攔截全域點擊事件，強制轉換為「下一步」
  clickAnywhereHandler = (e) => {
    // 如果使用者點擊的是對話框裡面的按鈕，就讓按鈕自己處理，不要攔截
    if (e.target.closest('.driver-popover')) {
      return;
    }
    
    e.stopPropagation();
    e.preventDefault();
    if (driverObj.hasNextStep()) {
      driverObj.moveNext();
    } else {
      driverObj.destroy();
    }
  };

  // 延遲啟動，確保畫面已經渲染完成
  setTimeout(() => {
    driverObj.drive();
    setTimeout(() => {
      document.addEventListener('click', clickAnywhereHandler, true);
    }, 100);
  }, 500);
};