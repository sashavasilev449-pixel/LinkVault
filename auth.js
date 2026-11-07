/* Авторизация и MFA. Клиентский ключ Supabase должен быть только publishable/anon. */
(() => {
  const $ = id => document.getElementById(id);
  const url = window.LINKVAULT_SUPABASE_URL;
  const key = window.LINKVAULT_SUPABASE_ANON_KEY;
  const configured = url && key && !url.includes('ВСТАВЬТЕ_') && !key.includes('ВСТАВЬТЕ_');
  const client = configured ? window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
  let mode = 'login';
  let currentUser = null;
  let enrolledFactorId = null;
  let challengeId = null;
  const authMessage = (message, error=false) => { $('authMessage').textContent = message; $('authMessage').classList.toggle('error', error); };
  const showAuth = (show) => { $('authScreen').hidden = !show; document.querySelector('.app-shell').style.display = show ? 'none' : ''; };
  const setMode = next => {
    mode = next;
    const signup = mode === 'signup';
    $('authTitle').textContent = signup ? 'Создать аккаунт' : 'Добро пожаловать';
    $('authSubtitle').textContent = signup ? 'Создай личную библиотеку ссылок.' : 'Войди, чтобы открыть свои сохранённые ссылки.';
    $('authSubmit').textContent = signup ? 'Зарегистрироваться' : 'Войти';
    $('authModeBtn').textContent = signup ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт';
    $('confirmPasswordWrap').hidden = !signup;
    $('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
    $('forgotPasswordBtn').hidden = signup;
    authMessage('');
  };
  async function refreshAdminVisibility() {
    const { data, error } = await client.rpc('is_linkvault_admin');
    $('adminOpenBtn').hidden = !!error || data !== true;
  }
  async function showAccount() {
    if (!currentUser) return;
    $('accountEmail').textContent = currentUser.email || 'Аккаунт LinkVault';
    $('mfaSetupArea').hidden = true;
    $('mfaChallengeArea').hidden = true;
    const { data } = await client.auth.mfa.listFactors();
    const verified = (data?.totp || []).some(f => f.status === 'verified');
    $('mfaSetupBtn').hidden = verified;
    $('mfaDisableBtn').hidden = !verified;
    await refreshAdminVisibility();
    $('accountModal').hidden = false;
  }
  async function finishLogin(user) {
    currentUser = user;
    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!assuranceError && assurance?.nextLevel === 'aal2' && assurance?.currentLevel !== 'aal2') {
      const { data: factors } = await client.auth.mfa.listFactors();
      const factor = (factors?.totp || []).find(f => f.status === 'verified');
      if (factor) {
        const { data: challenge, error } = await client.auth.mfa.challenge({ factorId: factor.id });
        if (error) { showAuth(true); authMessage(error.message, true); return; }
        challengeId = challenge.id; enrolledFactorId = factor.id;
        showAuth(false); $('accountModal').hidden = false; $('mfaChallengeArea').hidden = false; $('mfaSetupArea').hidden = true;
        $('mfaSetupBtn').hidden = true; $('mfaDisableBtn').hidden = true; $('adminOpenBtn').hidden = true;
        $('accountEmail').textContent = user.email || 'Подтверди вход';
        return;
      }
    }
    $('accountButton').textContent = (user.email || 'Аккаунт').slice(0, 18);
    showAuth(false);
    $('accountEmail').textContent = user.email || '';
    await refreshAdminVisibility();
    if (window.loadLibraryFromCloud) await window.loadLibraryFromCloud();
  }
  async function init() {
    if (!configured) {
      showAuth(true);
      $('authTitle').textContent = 'Подключи Supabase';
      $('authSubtitle').textContent = 'Заполни URL и publishable/anon key в файле supabase-config.js, затем обнови страницу.';
      $('authForm').hidden = true; $('authModeBtn').hidden = true; $('forgotPasswordBtn').hidden = true;
      return;
    }
    $('authForm').addEventListener('submit', async e => {
      e.preventDefault(); authMessage('Пожалуйста, подожди…');
      const email = $('authEmail').value.trim();
      const password = $('authPassword').value;
      if (mode === 'recovery') {
        if (password !== $('authPasswordConfirm').value) return authMessage('Пароли не совпадают.', true);
        const { error } = await client.auth.updateUser({ password });
        if (error) return authMessage(error.message, true);
        authMessage('Пароль изменён. Теперь войди в аккаунт.');
        await client.auth.signOut(); currentUser = null; setMode('login'); return;
      }
      if (mode === 'signup') {
        if (password !== $('authPasswordConfirm').value) return authMessage('Пароли не совпадают.', true);
        if (password.length < 8) return authMessage('Пароль должен содержать минимум 8 символов.', true);
        const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
        if (error) return authMessage(error.message, true);
        if (data.session && data.user) await finishLogin(data.user);
        else authMessage('Письмо для подтверждения отправлено. Проверь почту и перейди по ссылке.');
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) return authMessage('Не удалось войти. Проверь почту и пароль.', true);
        await finishLogin(data.user);
      }
    });
    $('authModeBtn').addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
    $('forgotPasswordBtn').addEventListener('click', async () => {
      const email = $('authEmail').value.trim();
      if (!email) return authMessage('Сначала введи адрес электронной почты.', true);
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
      authMessage(error ? error.message : 'Если для этого адреса есть аккаунт, письмо для сброса пароля отправлено.');
    });
    $('accountButton').addEventListener('click', showAccount);
    $('signOutBtn').addEventListener('click', async () => { await client.auth.signOut(); currentUser = null; localStorage.removeItem('linkvault_links_v1'); localStorage.removeItem('linkvault_categories_v1'); $('accountModal').hidden = true; showAuth(true); setMode('login'); });
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { $(b.dataset.close).hidden = true; }));
    $('mfaSetupBtn').addEventListener('click', async () => {
      // Удаляем незавершённые TOTP-факторы с таким именем, оставшиеся после
      // прерванной настройки. Проверенный фактор повторно не создаём.
      const { data: listed, error: listError } = await client.auth.mfa.listFactors();
      if (listError) return alert('Не удалось проверить MFA-факторы: ' + listError.message);
      const verified = (listed?.totp || []).find(f => f.status === 'verified');
      if (verified) {
        $('mfaSetupBtn').hidden = true;
        $('mfaDisableBtn').hidden = false;
        return alert('Двухфакторная защита уже подключена к аккаунту.');
      }
      const stale = (listed?.all || listed?.totp || []).filter(f =>
        f.factor_type === 'totp' && f.status !== 'verified' &&
        f.friendly_name === 'LinkVault Authenticator'
      );
      for (const factor of stale) {
        const { error: removeError } = await client.auth.mfa.unenroll({ factorId: factor.id });
        if (removeError) return alert('Не удалось удалить незавершённую настройку MFA: ' + removeError.message);
      }
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'LinkVault Authenticator'
      });
      if (error) return alert('Не удалось начать настройку 2FA: ' + error.message);
      enrolledFactorId = data.id;
      $('mfaQr').src = data.totp.qr_code;
      $('mfaSecret').textContent = data.totp.secret;
      $('mfaSetupArea').hidden = false;
    });
    $('mfaVerifyBtn').addEventListener('click', async () => {
      const code = $('mfaCode').value.trim();
      const { data: ch, error: chError } = await client.auth.mfa.challenge({ factorId: enrolledFactorId });
      if (chError) return alert(chError.message);
      const { error } = await client.auth.mfa.verify({ factorId: enrolledFactorId, challengeId: ch.id, code });
      if (error) return alert('Код не подошёл. Проверь время на телефоне и попробуй ещё раз.');
      $('mfaSetupArea').hidden = true; $('mfaSetupBtn').hidden = true; $('mfaDisableBtn').hidden = false;
      alert('Двухфакторная защита включена. Сохрани доступ к приложению-аутентификатору.');
    });
    $('mfaLoginVerifyBtn').addEventListener('click', async () => {
      const { error } = await client.auth.mfa.verify({ factorId: enrolledFactorId, challengeId, code: $('mfaLoginCode').value.trim() });
      if (error) return alert('Неверный код. Попробуй ещё раз.');
      $('accountModal').hidden = true;
      $('accountButton').textContent = (currentUser.email || 'Аккаунт').slice(0, 18);
      await refreshAdminVisibility();
      if (window.loadLibraryFromCloud) await window.loadLibraryFromCloud();
    });
    $('mfaDisableBtn').addEventListener('click', async () => {
      if (!confirm('Отключить двухфакторную защиту?')) return;
      const { data } = await client.auth.mfa.listFactors();
      const factor = (data?.totp || []).find(f => f.status === 'verified');
      if (factor) { const { error } = await client.auth.mfa.unenroll({ factorId: factor.id }); if (error) return alert(error.message); }
      $('mfaDisableBtn').hidden = true; $('mfaSetupBtn').hidden = false; alert('Двухфакторная защита отключена.');
    });
    $('adminOpenBtn').addEventListener('click', async () => { $('accountModal').hidden = true; await loadAdminStats(); $('adminModal').hidden = false; });
    $('adminRefreshBtn').addEventListener('click', loadAdminStats);
    async function loadAdminStats() {
      const { data, error } = await client.rpc('linkvault_admin_stats');
      if (error) return alert('Не удалось загрузить статистику. Проверь права администратора и SQL-настройки.');
      $('adminUsersTotal').textContent = data.users_total;
      $('adminUsersVerified').textContent = data.users_verified;
      $('adminUsersWeek').textContent = data.users_last_7_days;
      $('adminLinksTotal').textContent = data.links_total;
    }
    client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        currentUser = session?.user || currentUser; showAuth(true); setMode('recovery');
        $('authTitle').textContent = 'Новый пароль'; $('authSubtitle').textContent = 'Придумай новый пароль для LinkVault.';
        $('authPassword').value = ''; $('authPassword').placeholder = 'Новый пароль'; $('confirmPasswordWrap').hidden = false; $('authPasswordConfirm').value = ''; $('authPasswordConfirm').required = true; $('authSubmit').textContent = 'Сохранить пароль'; $('authModeBtn').hidden = true; $('forgotPasswordBtn').hidden = true;
      }
      if (session?.user) { currentUser = session.user; $('accountButton').textContent = (session.user.email || 'Аккаунт').slice(0, 18); }
    });
    const { data: { session } } = await client.auth.getSession();
    if (session?.user) await finishLogin(session.user); else showAuth(true);
  }
  window.LVAuth = { client, getUser: () => currentUser, configured, init };
  document.addEventListener('DOMContentLoaded', init);
})();
