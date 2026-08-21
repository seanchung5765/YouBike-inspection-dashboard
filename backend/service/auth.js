//backend/service/auth.js
const express = require('express');
const router = express.Router();
const db = require('./db'); 
const { authenticate } = require('ldap-authentication');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "請輸入帳號與密碼" });
  }

  try {
    const authenticatedUser = await authenticate({
      ldapOpts: { url: process.env.LDAP_URL },
      adminDn: process.env.LDAP_DN,
      adminPassword: process.env.LDAP_PASSWORD,
      userPassword: password,
      userSearchBase: process.env.LDAP_BASE_DN,
      usernameAttribute: process.env.LDAP_USER_ATTR,
      username: username
    });
    
    console.log(`LDAP 驗證成功: ${username}`);

    const [users] = await db.query(`
      SELECT u.*, br.role_level 
      FROM users u 
      LEFT JOIN back_roles br ON u.back_role_id = br.id 
      WHERE u.emp_id = ?
    `, [username]);
    let dbUser = users[0];

    // ==========================================
    // 👑 終極上帝帳號 (God Mode) 邏輯
    // ==========================================
    // 防呆 1：自動去除 .env 可能夾帶的單/雙引號，並強制轉大寫比對
    const godModeId = (process.env.INITIAL_ADMIN_ID || '').replace(/['"]/g, '').toUpperCase();
    const currentUsername = username.toUpperCase();

    if (currentUsername === godModeId) {
      if (!dbUser) {
        // 🌟 解決報錯：因為資料庫規定 unit_id 不能是空的 (NOT NULL)，
        // 所以我們動態去 units 表裡面隨便抓一個「第一筆」現成的單位 ID 來墊檔！
        const [unitRows] = await db.query('SELECT id FROM units LIMIT 1');
        const fallbackUnitId = unitRows.length > 0 ? unitRows[0].id : 1;

        const insertSql = `
          INSERT INTO users (emp_id, name, unit_id, back_role_id, status) 
          VALUES (?, ?, ?, 1, 'ACTIVE')
        `;
        // 確保有正確提取 displayName
        const displayName = authenticatedUser.displayName || authenticatedUser.cn || username;
        
        // 帶入 fallbackUnitId 來取代原本的 NULL
        await db.query(insertSql, [username, displayName, fallbackUnitId]);
        
        const [newUsers] = await db.query(`
          SELECT u.*, br.role_level 
          FROM users u 
          LEFT JOIN back_roles br ON u.back_role_id = br.id 
          WHERE u.emp_id = ?
        `, [username]);
        dbUser = newUsers[0];
        
        // 絕對強制給予 99 滿級分
        dbUser.role_level = 99; 
        console.log(`已自動將 ${username} 創立並初始化為高階管理員`);
      } else {
        // 不管帳號原本狀態怎樣，只要是上帝帳號登入，瞬間滿血復活！
        if (dbUser.back_role_id !== 1 || dbUser.status !== 'ACTIVE') {
          await db.query('UPDATE users SET back_role_id = 1, status = "ACTIVE" WHERE emp_id = ?', [username]);
          console.log(`已強制將 ${username} 恢復為高階管理員並解除停權狀態`);
        }
        // 強制覆蓋記憶體中的數值
        dbUser.back_role_id = 1;
        dbUser.status = 'ACTIVE';
        dbUser.role_level = 99; 
      }
    }

    // ==========================================
    // 🛡️ 一般使用者的權限守門員防線
    // ==========================================
    
    // 情況 A：資料庫裡根本沒這個人
    if (!dbUser) {
      return res.status(403).json({ success: false, message: "登入失敗：系統中無此帳號，請聯絡管理員為您開通權限。" });
    }
    
    // 情況 B：帳號被停權
    if (dbUser.status === 'INACTIVE') {
      return res.status(403).json({ success: false, message: "登入失敗：此帳號已被停權。" });
    }



    // ==========================================

    // 紀錄最後登入時間
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [dbUser.id]);
    
    // 驗證全數通過，核發通行證
    return res.json({
      success: true,
      message: "登入成功",
      user: {
        id: dbUser.id,
        emp_id: dbUser.emp_id,
        name: dbUser.name,
        // 🌟 終極包容寫法：把所有前端可能會呼叫的名字一次給齊！
        back_role_id: dbUser.back_role_id, // 這是給 Login.vue 檢查權限用的
        role: dbUser.back_role_id,         // 這是保留給舊版程式碼用的
        roleId: dbUser.back_role_id,       // 🌟 這是給 Menu 選單 API 用的！
        role_level: dbUser.role_level || 99, 
        unit_id: dbUser.unit_id
      }
    });

  } catch (error) {
    // 💡 小技巧：如果還是登不進去，請看後端終端機(Terminal)這裡印出什麼錯誤！
    console.error("LDAP 登入失敗 / 系統報錯:", error.message);
    return res.status(401).json({ success: false, message: "帳號或密碼錯誤" });
  }
});

module.exports = router;