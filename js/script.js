// ========================================================================
//  ANTI-DEVELOPER TOOLS
// ========================================================================
(function antiDevTools() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (!isMobile) {
        document.addEventListener('keydown', function(e) {
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) || (e.ctrlKey && e.key === 'U')) {
                e.preventDefault();
                window.location.href = 'https://www.google.com';
            }
        });
        let devToolsDetected = false;
        function detectDevTools() {
            const threshold = 160;
            const widthThreshold = window.outerWidth - window.innerWidth > threshold;
            const heightThreshold = window.outerHeight - window.innerHeight > threshold;
            if (widthThreshold || heightThreshold) {
                if (!devToolsDetected) {
                    devToolsDetected = true;
                    console.clear();
                    setTimeout(function() { window.location.href = 'https://www.google.com'; }, 100);
                }
            } else { devToolsDetected = false; }
        }
        setInterval(detectDevTools, 100);
        setInterval(function() { console.clear(); }, 100);
        const noop = function() {};
        console.log = noop; console.warn = noop; console.error = noop; console.info = noop; console.debug = noop;
        console.table = noop; console.trace = noop; console.dir = noop; console.dirxml = noop; console.group = noop;
        console.groupEnd = noop; console.groupCollapsed = noop; console.clear = noop; console.count = noop;
        console.countReset = noop; console.assert = noop; console.profile = noop; console.profileEnd = noop;
        console.time = noop; console.timeEnd = noop; console.timeLog = noop;
        window.open = function() { window.location.href = 'https://www.google.com'; return null; };
        window.eval = function() { window.location.href = 'https://www.google.com'; return null; };
    }
})();

// ========================================================================
//  MAIN APP
// ========================================================================
(function() {
    const API_BASE = 'https://video-play-api.newstreamcp.workers.dev/api';
    const SESSION_KEY = 'video_portal_session';
    const GOOGLE_SESSION_KEY = 'google_session';
    const RESET_DURATION = 3 * 24 * 60 * 60 * 1000;
    const STARRED_KEY = 'video_portal_starred';
    const WATCHED_KEY = 'video_portal_watched';

    const SECTIONS = ['recorded', 'reasoning', 'quant', 'computer', 'english'];
    let sectionPlaylists = { recorded: [], reasoning: [], quant: [], computer: [], english: [] };
    let sectionCurrentPlaylistId = { recorded: null, reasoning: null, quant: null, computer: null, english: null };
    let playlists = [];
    let currentPlaylistId = null;
    let currentUser = null;
    let googleUser = null;
    let googleAccessToken = null;
    let resetCheckInterval = null;
    let timerStartTime = Date.now();
    let sessionValidationInterval = null;
    let isHijacked = false;
    let isImportantHidden = false;
    
    let activePlayer = null;
    let activePlayerId = null;

    // ===== STARRED / WATCHED STORAGE =====
    function getStarred() {
        try { return JSON.parse(localStorage.getItem(STARRED_KEY)) || []; } catch { return []; }
    }
    function saveStarred(arr) { localStorage.setItem(STARRED_KEY, JSON.stringify(arr)); }
    function toggleStarred(chapterId) {
        let starred = getStarred();
        const idx = starred.indexOf(chapterId);
        if (idx > -1) { starred.splice(idx, 1); } else { starred.push(chapterId); }
        saveStarred(starred);
        renderStarredTab();
        updateAllChaptersStarState();
        updateTabCounts();
    }
    function isStarred(chapterId) { return getStarred().includes(chapterId); }

    function getWatched() {
        try { return JSON.parse(localStorage.getItem(WATCHED_KEY)) || []; } catch { return []; }
    }
    function saveWatched(arr) { localStorage.setItem(WATCHED_KEY, JSON.stringify(arr)); }
    function toggleWatched(chapterId) {
        let watched = getWatched();
        const idx = watched.indexOf(chapterId);
        if (idx > -1) { watched.splice(idx, 1); } else { watched.push(chapterId); }
        saveWatched(watched);
        updateAllChaptersWatchedState();
        updateProgressBar();
        renderStarredTab();
        updateTabCounts();
    }
    function isWatched(chapterId) { return getWatched().includes(chapterId); }

    // ===== MARK ALL WATCHED FOR A PLAYLIST =====
    function markAllWatchedForPlaylist(sectionKey) {
        const playlistId = sectionCurrentPlaylistId[sectionKey];
        if (!playlistId) { showToast('⚠️ Please select a playlist first', 'error'); return; }
        const playlist = sectionPlaylists[sectionKey]?.find(p => p.id === playlistId);
        if (!playlist || !playlist.chapters) { showToast('⚠️ No chapters found in this playlist', 'error'); return; }
        let watched = getWatched();
        let added = 0;
        playlist.chapters.forEach(ch => {
            if (ch.id && !watched.includes(ch.id)) {
                watched.push(ch.id);
                added++;
            }
        });
        if (added > 0) {
            saveWatched(watched);
            updateAllChaptersWatchedState();
            updateProgressBar();
            renderStarredTab();
            updateTabCounts();
            showToast(`✅ ${added} lectures marked as watched in "${playlist.name}"`, 'success');
        } else {
            showToast('ℹ️ All lectures already watched in this playlist', 'info');
        }
    }

    function updateAllChaptersStarState() {
        document.querySelectorAll('.star-btn').forEach(btn => {
            const id = btn.dataset.chapterId;
            if (id) { btn.classList.toggle('active', isStarred(id)); }
        });
    }
    function updateAllChaptersWatchedState() {
        document.querySelectorAll('.chapter-item').forEach(item => {
            const id = item.dataset.chapterId;
            if (id) {
                item.classList.toggle('watched', isWatched(id));
                const btn = item.querySelector('.watched-btn');
                if (btn) {
                    btn.textContent = isWatched(id) ? '✅ Watched' : 'Mark Watched';
                    btn.classList.toggle('watched', isWatched(id));
                }
            }
        });
    }

    function updateProgressBar() {
        const watched = getWatched();
        let total = 0;
        SECTIONS.forEach(sec => {
            sectionPlaylists[sec]?.forEach(p => { if (p.chapters) total += p.chapters.length; });
        });
        const completed = watched.length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressLabel').textContent = pct + '% (' + completed + '/' + total + ')';
    }

    function updateTabCounts() {
        SECTIONS.forEach(sec => {
            const cnt = sectionPlaylists[sec]?.reduce((acc, p) => acc + (p.chapters?.length || 0), 0) || 0;
            const el = document.getElementById('tabCount-' + sec);
            if (el) el.textContent = cnt;
        });
        const starredCnt = getStarred().length;
        const el = document.getElementById('tabCount-starred');
        if (el) el.textContent = starredCnt;
    }

    // ===== SESSION MANAGEMENT =====
    function generateSessionId() {
        return 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8) + '_' + Math.random().toString(36).substring(2, 6);
    }
    function saveSession(user, key, sessionId) {
        const session = { user, key, sessionId: sessionId || generateSessionId(), loginTime: Date.now(), device: getDeviceInfo() };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    }
    function getSession() {
        try { const data = localStorage.getItem(SESSION_KEY); return data ? JSON.parse(data) : null; } catch { return null; }
    }
    function clearSession() { localStorage.removeItem(SESSION_KEY); if (sessionValidationInterval) { clearInterval(sessionValidationInterval); sessionValidationInterval = null; } }
    function getDeviceInfo() {
        const ua = navigator.userAgent;
        return (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) ? 'Mobile' : 'Desktop';
    }

    async function validateSession() {
        const session = getSession();
        if (!session) { handleSessionExpired(); return false; }
        try {
            const response = await fetch(API_BASE + '/session/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: session.sessionId, email: session.user.email, device: session.device || 'Unknown' })
            });
            const data = await response.json();
            if (data.hijacked || data.autoLogout) {
                isHijacked = true;
                clearSession();
                localStorage.removeItem(GOOGLE_SESSION_KEY);
                showHijackNotification();
                logout();
                return false;
            }
            if (!data.valid) { clearSession(); localStorage.removeItem(GOOGLE_SESSION_KEY); logout(); return false; }
            return true;
        } catch { return true; }
    }

    function showHijackNotification() {
        const el = document.getElementById('hijackNotification');
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 5000);
    }
    function handleSessionExpired() {
        if (document.getElementById('videoContent').style.display !== 'none') logout();
    }
    function startSessionValidation() {
        if (sessionValidationInterval) clearInterval(sessionValidationInterval);
        sessionValidationInterval = setInterval(() => {
            if (document.getElementById('videoContent').style.display !== 'none' && !isHijacked) validateSession();
        }, 8000);
    }

    // ===== KEY GENERATION =====
    async function generateKey() {
        const email = document.getElementById('genKeyEmail').value.trim();
        const statusEl = document.getElementById('genKeyStatus');
        if (!email) { statusEl.textContent = '⚠️ Please enter your email.'; statusEl.className = 'key-gen-status error'; return; }
        statusEl.textContent = '⏳ Checking...'; statusEl.className = 'key-gen-status info';
        try {
            const response = await fetch(API_BASE + '/key/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await response.json();
            if (data.success) {
                statusEl.innerHTML = `✅ Key generated: <strong>${data.key}</strong><br><span style="font-size:0.8rem;color:#1a7a3a;">⏱️ Valid for <strong>1 hour</strong> only<br>📊 <strong>${data.remaining_today || '3'}</strong> more key(s) left today</span>`;
                statusEl.className = 'key-gen-status success';
                if (navigator.clipboard) navigator.clipboard.writeText(data.key);
            } else {
                if (data.limit_reached) {
                    statusEl.innerHTML = `❌ ${data.error}<br><span style="font-size:0.8rem;color:#856404;">⏳ Wait until tomorrow to generate more keys.</span>`;
                } else if (data.wait_time) {
                    statusEl.innerHTML = `⏳ ${data.error}<br><span style="font-size:0.8rem;color:#856404;">Please wait <strong>${data.wait_time}</strong> more minute(s).</span>`;
                } else {
                    statusEl.textContent = '❌ ' + (data.error || 'Failed to generate key');
                }
                statusEl.className = 'key-gen-status error';
            }
        } catch (error) {
            statusEl.textContent = '❌ Network error: ' + error.message;
            statusEl.className = 'key-gen-status error';
        }
    }

    // ===== GOOGLE TOKEN =====
    (function() {
        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1));
            const token = params.get('access_token');
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    googleUser = { email: payload.email, name: payload.name, picture: payload.picture, id: payload.sub };
                    googleAccessToken = token;
                    localStorage.setItem(GOOGLE_SESSION_KEY, JSON.stringify({ user: googleUser, accessToken: googleAccessToken, loginTime: Date.now() }));
                    document.getElementById('loginSuccess').textContent = '✅ Google Sign-In successful!';
                    showVideoContent();
                    fetchPlaylists();
                    fetchImportantSection();
                } catch(e) { console.error('Token decode error:', e); }
            }
        }
    })();

    function checkGoogleSession() {
        try {
            const data = localStorage.getItem(GOOGLE_SESSION_KEY);
            if (!data) return false;
            const session = JSON.parse(data);
            if (Date.now() - session.loginTime > 7 * 24 * 60 * 60 * 1000) { localStorage.removeItem(GOOGLE_SESSION_KEY); return false; }
            googleUser = session.user; googleAccessToken = session.accessToken; return true;
        } catch { return false; }
    }

    // ===== TIMER =====
    function startResetTimer() {
        if (resetCheckInterval) clearInterval(resetCheckInterval);
        const savedStart = localStorage.getItem('timer_start');
        timerStartTime = savedStart ? parseInt(savedStart) : Date.now();
        if (!savedStart) localStorage.setItem('timer_start', timerStartTime.toString());
        resetCheckInterval = setInterval(() => {
            const elapsed = Date.now() - timerStartTime;
            const timeLeft = Math.max(0, RESET_DURATION - elapsed);
            const timerEl = document.getElementById('sessionTimer');
            if (timerEl) {
                const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
                timerEl.textContent = `⏰ ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                timerEl.className = 'session-timer' + (timeLeft < 60 * 60 * 1000 ? ' danger' : timeLeft < 3 * 60 * 60 * 1000 ? ' warning' : '');
            }
            if (timeLeft <= 0) {
                localStorage.removeItem('timer_start');
                localStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(GOOGLE_SESSION_KEY);
                if (document.getElementById('videoContent').style.display !== 'none') {
                    document.getElementById('resetBanner').style.display = 'block';
                    setTimeout(() => { document.getElementById('resetBanner').style.display = 'none'; logout(); }, 3000);
                }
            }
        }, 1000);
    }

    // ===== LOGIN =====
    async function login() {
        const email = document.getElementById('loginEmail').value.trim();
        const key = document.getElementById('loginKey').value.trim();
        const errorEl = document.getElementById('loginError');
        const successEl = document.getElementById('loginSuccess');
        errorEl.textContent = ''; successEl.textContent = '';
        if (!email) { errorEl.textContent = '⚠️ Please enter your email'; return; }
        try {
            const sessionId = generateSessionId();
            const device = getDeviceInfo();
            const response = await fetch(API_BASE + '/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, key: key || '', sessionId, device })
            });
            const data = await response.json();
            if (data.success) {
                currentUser = data.user;
                successEl.textContent = '✅ Login successful! Loading videos...';
                saveSession(data.user, key, sessionId);
                isHijacked = false;
                showVideoContent();
                fetchPlaylists();
                fetchImportantSection();
                startSessionValidation();
                document.getElementById('hijackNotification').classList.remove('show');
            } else {
                errorEl.textContent = '❌ ' + (data.error || 'Login failed');
                if (data.error && data.error.includes('already logged in')) errorEl.textContent = '❌ You are already logged in on another device.';
            }
        } catch (error) {
            errorEl.textContent = '❌ Connection error: ' + error.message;
        }
    }

    // ===== LOGOUT =====
    window.logout = async function() {
        const session = getSession();
        if (session && session.user) {
            try {
                await fetch(API_BASE + '/auth/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: session.sessionId, email: session.user.email })
                });
            } catch(e) { console.error('Logout error:', e); }
        }
        clearSession();
        if (sessionValidationInterval) { clearInterval(sessionValidationInterval); sessionValidationInterval = null; }
        localStorage.removeItem(GOOGLE_SESSION_KEY);
        currentUser = null; googleUser = null; googleAccessToken = null; isHijacked = false;
        document.getElementById('loginContainer').style.display = 'block';
        document.getElementById('videoContent').style.display = 'none';
        document.getElementById('googleStatusBar').style.display = 'none';
        document.getElementById('userBar').style.display = 'none';
        document.getElementById('userEmail').textContent = '-';
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginKey').value = '';
        document.getElementById('loginError').textContent = '';
        document.getElementById('loginSuccess').textContent = '';
        document.getElementById('resetBanner').style.display = 'none';
        if (resetCheckInterval) { clearInterval(resetCheckInterval); resetCheckInterval = null; }
        document.getElementById('durationDisplay').textContent = '00:00:00';
        disposePlayer();
        for (let key in window) {
            if (key.startsWith('player_') && window[key] && typeof window[key].dispose === 'function') {
                try { window[key].dispose(); } catch(e) {}
            }
            if (key.startsWith('hls_') && window[key] && typeof window[key].destroy === 'function') {
                try { window[key].destroy(); } catch(e) {}
            }
        }
    };

    // ===== PLAYER FUNCTIONS =====
    function disposePlayer() {
        if (activePlayer) {
            try { activePlayer.off('timeupdate'); activePlayer.off('ended'); activePlayer.off('loadstart'); activePlayer.dispose(); } catch(e) {}
            activePlayer = null; activePlayerId = null;
        }
    }

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0');
    }

    function showToast(message, type = 'info') {
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.textContent = message;
            statusBar.style.background = type === 'error' ? '#fee' : type === 'success' ? '#e6f5e6' : '#fff3cd';
            statusBar.style.color = type === 'error' ? '#b33a3a' : type === 'success' ? '#1a5d3c' : '#856404';
            setTimeout(() => { statusBar.style.background = '#f0f4fb'; statusBar.style.color = '#4c637f'; }, 2000);
        }
    }

    function extractYouTubeId(url) {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2] && match[2].length === 11) return match[2];
        if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
        return null;
    }

    // ===== INIT PROFESSIONAL PLAYER =====
    function initProfessionalPlayer(wrapper, link, playerId) {
        disposePlayer();
        const loadingSpinner = wrapper.querySelector('.loading-spinner-pos');
        if (loadingSpinner) loadingSpinner.classList.add('show');

        const isYouTube = link && (link.includes('youtube.com') || link.includes('youtu.be'));
        const isHLS = link && link.includes('.m3u8');

        if (isYouTube) {
            const videoId = extractYouTubeId(link);
            if (videoId) {
                let embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&controls=0&showinfo=0&iv_load_policy=3`;
                if (googleUser) embedUrl += `&origin=${window.location.origin}`;
                wrapper.innerHTML = `<iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;height:100%;aspect-ratio:16/9;border:none;border-radius:12px;"></iframe>`;
                if (loadingSpinner) loadingSpinner.classList.remove('show');
                showToast('🎬 YouTube video loaded', 'info');
                return;
            }
        }

        wrapper.innerHTML = `<video id="professional-player-${playerId}" class="video-js vjs-default-skin" controls preload="auto" playsinline style="width:100%;height:100%;aspect-ratio:16/9;"><source src="${link}" type="${isHLS ? 'application/x-mpegURL' : 'video/mp4'}"><p class="vjs-no-js">Please enable JavaScript to view this player.</p></video>`;
        const videoElement = document.getElementById(`professional-player-${playerId}`);
        if (!videoElement) return;

        const player = videojs(videoElement, {
            controls: true, autoplay: true, responsive: true, liveui: false,
            userActions: { hotkeys: true, seek: 10 },
            html5: { hls: { enableLowInitialPlaylist: true, overrideNative: true } },
            controlBar: { children: ['playToggle', 'currentTimeDisplay', 'durationDisplay', 'progressControl', 'volumePanel', 'fullscreenToggle'] }
        });

        activePlayer = player;
        activePlayerId = playerId;

        player.on('loadedmetadata', function() {
            const duration = player.duration();
            if (!isFinite(duration) || duration === 0 || duration === Infinity) player.addClass('vjs-live');
            else player.removeClass('vjs-live');
            if (loadingSpinner) loadingSpinner.classList.remove('show');
        });

        player.on('durationchange', function() {
            const duration = player.duration();
            if (!isFinite(duration) || duration === 0 || duration === Infinity) player.addClass('vjs-live');
            else player.removeClass('vjs-live');
        });

        player.on('timeupdate', function() {
            const currentTime = player.currentTime();
            if (currentTime && !isNaN(currentTime) && currentTime > 0) {
                const hours = Math.floor(currentTime / 3600);
                const minutes = Math.floor((currentTime % 3600) / 60);
                const seconds = Math.floor(currentTime % 60);
                document.getElementById('durationDisplay').textContent = 
                    String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
            }
        });

        player.on('ended', function() {
            document.getElementById('durationDisplay').textContent = '00:00:00';
        });

        player.ready(function() {
            const progressControl = player.controlBar.progressControl;
            if (progressControl) {
                const progressHolder = progressControl.el().querySelector('.vjs-progress-holder');
                if (progressHolder) {
                    progressHolder.addEventListener('click', function(e) {
                        const rect = this.getBoundingClientRect();
                        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        const duration = player.duration();
                        if (duration && !isNaN(duration) && isFinite(duration) && duration > 0) {
                            const seekTime = x * duration;
                            player.currentTime(seekTime);
                            showToast('⏩ ' + formatTime(seekTime), 'info');
                        }
                    });
                }
            }

            const speedSelect = document.createElement('select');
            speedSelect.className = 'vjs-speed-select';
            const speeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
            speeds.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s; opt.textContent = s + '×';
                if (s === 1.0) opt.selected = true;
                speedSelect.appendChild(opt);
            });
            const wrapper2 = document.createElement('div');
            wrapper2.className = 'speed-select-wrap';
            wrapper2.appendChild(speedSelect);
            const controlBar = player.controlBar.el();
            const volumePanel = controlBar.querySelector('.vjs-volume-panel');
            if (volumePanel) volumePanel.parentNode.insertBefore(wrapper2, volumePanel.nextSibling);
            else controlBar.appendChild(wrapper2);

            speedSelect.addEventListener('change', function() {
                const val = parseFloat(this.value);
                if (!isNaN(val) && val > 0) {
                    player.playbackRate(val);
                    showToast('⚡ Speed: ' + val + 'x', 'success');
                }
            });
            player.playbackRate(1.0);
        });

        document.addEventListener('keydown', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
            const isLive = player.hasClass('vjs-live');
            if (isLive && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                e.preventDefault();
                showToast('⛔ LIVE stream mein forward/backward disabled', 'error');
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                const current = player.currentTime() || 0;
                const duration = player.duration() || 0;
                const newTime = Math.min(duration, current + 10);
                player.currentTime(newTime);
                showToast('⏩ +10s', 'info');
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const current = player.currentTime() || 0;
                const newTime = Math.max(0, current - 10);
                player.currentTime(newTime);
                showToast('⏪ -10s', 'info');
            } else if (e.code === 'Space') {
                e.preventDefault();
                if (player.paused()) player.play();
                else player.pause();
            }
        });

        player.on('error', function() {
            showToast('❌ Video error - Please try again', 'error');
            if (loadingSpinner) loadingSpinner.classList.remove('show');
        });

        window[`player_${playerId}`] = player;
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ===== SHOW VIDEO CONTENT =====
    function showVideoContent() {
        const user = currentUser || googleUser;
        if (!user) return;
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('videoContent').style.display = 'block';
        document.getElementById('googleStatusBar').style.display = 'flex';
        document.getElementById('userBar').style.display = 'flex';
        document.getElementById('userEmail').textContent = user.email;
        
        const isGoogleLoggedIn = !!googleUser;
        const dot = document.getElementById('googleStatusDot');
        const text = document.getElementById('googleStatusText');
        const btn = document.getElementById('googleSigninBtn');
        if (isGoogleLoggedIn) {
            dot.className = 'status-dot connected';
            text.textContent = `✅ Google Connected: ${googleUser.email}`;
            btn.textContent = '✅ Connected';
            btn.className = 'signin-btn google-connected';
            btn.onclick = null;
        } else {
            dot.className = 'status-dot disconnected';
            text.textContent = '⚠️ Google not connected';
            btn.textContent = '🔑 Sign in';
            btn.className = 'signin-btn';
            btn.onclick = function() {
                document.getElementById('loginContainer').style.display = 'block';
                document.getElementById('loginContainer').scrollIntoView({behavior:'smooth'});
            };
        }
        
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            if (isGoogleLoggedIn) {
                statusBar.innerHTML = `✅ <strong>Google Connected:</strong> ${googleUser.email}`;
                statusBar.style.background = '#e6f5e6'; statusBar.style.color = '#1a5d3c';
            } else {
                statusBar.innerHTML = `⚠️ <strong>Google Not Connected:</strong> <a href="#" onclick="document.getElementById('loginContainer').style.display='block';document.getElementById('loginContainer').scrollIntoView({behavior:'smooth'});return false;" style="color:#1a2b4c;font-weight:600;text-decoration:underline;cursor:pointer;">Sign in</a> to watch private YouTube videos.`;
                statusBar.style.background = '#fff3cd'; statusBar.style.color = '#856404';
            }
        }
        startResetTimer();
        updateProgressBar();
        updateTabCounts();
    }

    // ===== FETCH IMPORTANT SECTION =====
    async function fetchImportantSection() {
        const container = document.getElementById('importantItems');
        try {
            const response = await fetch(API_BASE + '/important');
            const data = await response.json();
            if (data.success && data.items && data.items.length > 0) {
                let html = '';
                data.items.forEach(item => {
                    const playerId = `important-${item.id}`;
                    const isVisible = item.is_visible !== 0;
                    if (!isVisible) isImportantHidden = true;
                    html += `
                        <div class="important-item" data-id="${item.id}" data-visible="${isVisible}" data-player-id="${playerId}">
                            <span class="name">${item.title}</span>
                            <button class="important-play-btn" data-player-id="${playerId}" data-link="${item.link}" data-title="${item.title}">▶ Play</button>
                            <div class="player-wrapper-professional" id="wrapper-${playerId}" style="display: none;">
                                <div class="loading-spinner-pos" id="spinner-${playerId}"><div class="spinner"></div></div>
                            </div>
                        </div>
                    `;
                });
                container.innerHTML = html;
                const section = document.getElementById('importantSection');
                if (isImportantHidden) { section.classList.add('hidden-section'); document.getElementById('durationBar').classList.add('hidden'); }
                else { section.classList.remove('hidden-section'); document.getElementById('durationBar').classList.remove('hidden'); }
                attachImportantPlayEvents();
            } else {
                container.innerHTML = `<div class="empty-important">No Live classes available</div>`;
                document.getElementById('durationBar').classList.add('hidden');
            }
        } catch (error) {
            console.error('Error fetching important section:', error);
            container.innerHTML = `<div class="empty-important">⚠️ Failed to load Live classes</div>`;
        }
    }

    function attachImportantPlayEvents() {
        document.querySelectorAll('.important-play-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const playerId = this.dataset.playerId;
                const link = this.dataset.link;
                const wrapper = document.getElementById(`wrapper-${playerId}`);
                const parentItem = this.closest('.important-item');
                const isVisible = parentItem?.dataset?.visible === 'true';
                if (!isVisible) { showToast('⛔ This class is currently hidden by admin', 'error'); return; }
                if (!wrapper) return;
                if (wrapper.style.display === 'block' && wrapper.children.length > 0) {
                    wrapper.style.display = 'none'; wrapper.innerHTML = ''; disposePlayer(); document.getElementById('durationDisplay').textContent = '00:00:00'; return;
                }
                wrapper.style.display = 'block';
                document.getElementById('durationDisplay').textContent = '00:00:00';
                initProfessionalPlayer(wrapper, link, playerId);
            });
        });
    }

    // ===== FETCH PLAYLISTS =====
    async function fetchSectionPlaylists(sectionKey) {
        const dropdown = document.getElementById('playlistDropdown-' + sectionKey);
        const container = document.getElementById('chaptersContainer-' + sectionKey);
        const tabCount = document.getElementById('tabCount-' + sectionKey);
        if (!dropdown || !container) return;
        try {
            const response = await fetch(API_BASE + '/playlists?section=' + encodeURIComponent(sectionKey));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.success) {
                sectionPlaylists[sectionKey] = data.playlists;
                if (tabCount) tabCount.textContent = data.playlists.reduce((acc, p) => acc + (p.chapters?.length || 0), 0);
                dropdown.innerHTML = '<option value="">Select a playlist...</option>';
                data.playlists.forEach(playlist => {
                    const option = document.createElement('option');
                    option.value = playlist.id;
                    option.textContent = playlist.name;
                    dropdown.appendChild(option);
                });
                if (data.playlists.length > 0) {
                    dropdown.value = data.playlists[0].id;
                    sectionCurrentPlaylistId[sectionKey] = data.playlists[0].id;
                    renderSectionPlaylists(sectionKey);
                } else {
                    container.innerHTML = `<div class="empty-state">No playlists available</div>`;
                }
                updateTabCounts();
                updateProgressBar();
            }
        } catch (error) {
            container.innerHTML = `<div class="empty-state">❌ Failed to load videos</div>`;
            console.error(error);
        }
    }

    async function fetchPlaylists() {
        const statusBar = document.getElementById('statusBar');
        statusBar.textContent = '🔄 Fetching videos...';
        await Promise.all(SECTIONS.map(sec => fetchSectionPlaylists(sec)));
        playlists = sectionPlaylists.recorded;
        currentPlaylistId = sectionCurrentPlaylistId.recorded;
        const totalCount = SECTIONS.reduce((sum, sec) => sum + (sectionPlaylists[sec]?.reduce((a, p) => a + (p.chapters?.length || 0), 0) || 0), 0);
        statusBar.textContent = `✅ ${totalCount} lectures loaded`;
        updateProgressBar();
        renderStarredTab();
    }

    // ===== RENDER STARED TAB =====
    function renderStarredTab() {
        const container = document.getElementById('chaptersContainer-starred');
        if (!container) return;
        const starredIds = getStarred();
        if (starredIds.length === 0) {
            container.innerHTML = `<div class="empty-state">⭐ Your starred lectures will appear here</div>`;
            return;
        }
        let allChapters = [];
        SECTIONS.forEach(sec => {
            sectionPlaylists[sec]?.forEach(p => {
                p.chapters?.forEach(ch => {
                    allChapters.push({ ...ch, section: sec, playlistName: p.name, playlistId: p.id });
                });
            });
        });
        const starredChapters = allChapters.filter(ch => starredIds.includes(ch.id));
        if (starredChapters.length === 0) {
            container.innerHTML = `<div class="empty-state">⭐ Your starred lectures will appear here</div>`;
            return;
        }
        let html = `<div class="playlist-title">✨ Starred Lectures (${starredChapters.length})</div>`;
        starredChapters.forEach((chapter, idx) => {
            const playerId = `starred-${chapter.id || 'ch_' + Date.now()}`;
            let badge = '';
            if (chapter.link && (chapter.link.includes('youtube.com') || chapter.link.includes('youtu.be'))) {
                badge = `<span class="video-type-badge youtube">🎬 YouTube</span>`;
            } else if (chapter.link && chapter.link.includes('.m3u8')) {
                badge = `<span class="video-type-badge hls">📡 HLS</span>`;
            } else if (chapter.link && (chapter.link.includes('.mp4') || chapter.link.includes('.webm'))) {
                badge = `<span class="video-type-badge mp4">🎥 MP4</span>`;
            }
            const watched = isWatched(chapter.id) ? 'watched' : '';
            const watchedText = isWatched(chapter.id) ? '✅ Watched' : 'Mark Watched';
            html += `
                <div class="chapter-item ${watched}" data-chapter-id="${chapter.id}">
                    <span class="chapter-number">⭐ ${idx + 1}</span>
                    <span class="chapter-name">${chapter.name} <small style="color:#6a7c94;font-size:0.7rem;">(${chapter.playlistName})</small></span>
                    ${badge}
                    <div class="chapter-actions">
                        <button class="star-btn active" data-chapter-id="${chapter.id}" title="Remove Star">✨</button>
                        <button class="watched-btn ${watched}" data-chapter-id="${chapter.id}">${watchedText}</button>
                    </div>
                    <button class="play-btn" data-player-id="${playerId}" data-link="${chapter.link}">▶ Play</button>
                    <div class="player-wrapper" id="wrapper-${playerId}" style="display: none;"></div>
                </div>
            `;
        });
        container.innerHTML = html;
        attachPlayEvents(container);
        attachStarEvents(container);
        attachWatchedEvents(container);
    }

    // ===== RENDER SECTION PLAYLISTS =====
    function renderSectionPlaylists(sectionKey) {
        const container = document.getElementById('chaptersContainer-' + sectionKey);
        const dropdown = document.getElementById('playlistDropdown-' + sectionKey);
        const searchInput = document.getElementById('searchInput-' + sectionKey);
        if (!container || !dropdown || !searchInput) return;
        const searchTerm = searchInput.value.trim().toLowerCase();
        const allPlaylists = sectionPlaylists[sectionKey] || [];
        let filteredPlaylists = allPlaylists;
        if (searchTerm !== '') {
            filteredPlaylists = allPlaylists.filter(p => p.name.toLowerCase().includes(searchTerm));
        }
        const currentValue = dropdown.value;
        dropdown.innerHTML = '<option value="">Select a playlist...</option>';
        filteredPlaylists.forEach(playlist => {
            const option = document.createElement('option');
            option.value = playlist.id;
            option.textContent = playlist.name;
            dropdown.appendChild(option);
        });
        if (currentValue && filteredPlaylists.some(p => p.id === currentValue)) {
            dropdown.value = currentValue;
        }
        if (filteredPlaylists.length === 0 && searchTerm !== '') {
            container.innerHTML = `<div class="empty-state">🔍 No playlists found matching "${searchTerm}"</div>`;
            return;
        }
        const selectedId = dropdown.value;
        if (!selectedId) {
            container.innerHTML = `<div class="empty-state">Select a playlist from the dropdown</div>`;
            return;
        }
        sectionCurrentPlaylistId[sectionKey] = selectedId;
        if (sectionKey === 'recorded') currentPlaylistId = selectedId;
        const playlist = filteredPlaylists.find(p => p.id === selectedId);
        if (!playlist) {
            container.innerHTML = `<div class="empty-state">Playlist not found</div>`;
            return;
        }
        if (!playlist.chapters || playlist.chapters.length === 0) {
            container.innerHTML = `<div class="empty-state">No chapters in this playlist</div>`;
            return;
        }
        let html = `<div class="playlist-title">📚 ${playlist.name}</div>`;
        playlist.chapters.forEach((chapter, index) => {
            const playerId = `player-${sectionKey}-${chapter.id || 'ch_' + Date.now()}`;
            let badge = '';
            if (chapter.link && (chapter.link.includes('youtube.com') || chapter.link.includes('youtu.be'))) {
                badge = `<span class="video-type-badge youtube">🎬 YouTube</span>`;
            } else if (chapter.link && chapter.link.includes('.m3u8')) {
                badge = `<span class="video-type-badge hls">📡 HLS</span>`;
            } else if (chapter.link && (chapter.link.includes('.mp4') || chapter.link.includes('.webm'))) {
                badge = `<span class="video-type-badge mp4">🎥 MP4</span>`;
            }
            const watched = isWatched(chapter.id) ? 'watched' : '';
            const watchedText = isWatched(chapter.id) ? '✅ Watched' : 'Mark Watched';
            const starred = isStarred(chapter.id) ? 'active' : '';
            html += `
                <div class="chapter-item ${watched}" data-chapter-id="${chapter.id}">
                    <span class="chapter-number">Lecture ${index + 1}</span>
                    <span class="chapter-name">${chapter.name}</span>
                    ${badge}
                    <div class="chapter-actions">
                        <button class="star-btn ${starred}" data-chapter-id="${chapter.id}" title="Bookmark">✨</button>
                        <button class="watched-btn ${watched}" data-chapter-id="${chapter.id}">${watchedText}</button>
                    </div>
                    <button class="play-btn" data-player-id="${playerId}" data-link="${chapter.link}">▶ Play</button>
                    <div class="player-wrapper" id="wrapper-${playerId}" style="display: none;"></div>
                </div>
            `;
        });
        container.innerHTML = html;
        attachPlayEvents(container);
        attachStarEvents(container);
        attachWatchedEvents(container);
        updateTabCounts();
        updateProgressBar();
    }

    function renderPlaylists() { renderSectionPlaylists('recorded'); }

    // ===== SEARCH =====
    function searchSectionPlaylists(sectionKey) {
        const dropdown = document.getElementById('playlistDropdown-' + sectionKey);
        if (!dropdown) return;
        dropdown.value = '';
        renderSectionPlaylists(sectionKey);
    }
    function clearSectionSearch(sectionKey) {
        const searchInput = document.getElementById('searchInput-' + sectionKey);
        const dropdown = document.getElementById('playlistDropdown-' + sectionKey);
        if (!searchInput || !dropdown) return;
        searchInput.value = '';
        dropdown.value = '';
        renderSectionPlaylists(sectionKey);
    }

    // ===== ATTACH EVENTS =====
    function attachStarEvents(scope) {
        const root = scope || document;
        root.querySelectorAll('.star-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.chapterId;
                if (id) { toggleStarred(id); }
            });
        });
    }

    function attachWatchedEvents(scope) {
        const root = scope || document;
        root.querySelectorAll('.watched-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.chapterId;
                if (id) { toggleWatched(id); }
            });
        });
    }

    function attachPlayEvents(scope) {
        const root = scope || document;
        root.querySelectorAll('.play-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const playerId = this.dataset.playerId;
                const link = this.dataset.link;
                const wrapper = document.getElementById(`wrapper-${playerId}`);
                if (!wrapper) return;
                if (wrapper.style.display === 'block') {
                    wrapper.style.display = 'none'; wrapper.innerHTML = ''; 
                    if (window[`hls_${playerId}`]) { try { window[`hls_${playerId}`].destroy(); } catch(e) {} delete window[`hls_${playerId}`]; }
                    if (window[`player_${playerId}`]) { try { window[`player_${playerId}`].off('timeupdate'); window[`player_${playerId}`].off('ended'); window[`player_${playerId}`].off('loadstart'); window[`player_${playerId}`].dispose(); } catch(e) {} delete window[`player_${playerId}`]; }
                    return;
                }
                wrapper.style.display = 'block';
                if (window[`hls_${playerId}`]) { try { window[`hls_${playerId}`].destroy(); } catch(e) {} delete window[`hls_${playerId}`]; }
                if (window[`player_${playerId}`]) { try { window[`player_${playerId}`].off('timeupdate'); window[`player_${playerId}`].off('ended'); window[`player_${playerId}`].off('loadstart'); window[`player_${playerId}`].dispose(); } catch(e) {} delete window[`player_${playerId}`]; }
                
                if (link && (link.includes('youtube.com') || link.includes('youtu.be'))) {
                    const videoId = extractYouTubeId(link);
                    if (videoId) {
                        let embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
                        if (googleUser) embedUrl += `&origin=${window.location.origin}`;
                        wrapper.innerHTML = `<iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;height:100%;aspect-ratio:16/9;border:none;border-radius:12px;"></iframe>`;
                        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        return;
                    }
                }
                if (link && link.includes('.m3u8') && Hls.isSupported()) {
                    const videoEl = document.createElement('video');
                    videoEl.id = playerId;
                    videoEl.className = 'video-js vjs-default-skin';
                    videoEl.setAttribute('controls', '');
                    videoEl.setAttribute('preload', 'auto');
                    videoEl.style.width = '100%'; videoEl.style.height = '100%'; videoEl.style.aspectRatio = '16/9';
                    wrapper.innerHTML = ''; wrapper.appendChild(videoEl);
                    const hls = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 30, maxMaxBufferLength: 60 });
                    hls.loadSource(link);
                    hls.attachMedia(videoEl);
                    hls.on(Hls.Events.MANIFEST_PARSED, function() { videoEl.play().catch(e => console.log('Play error:', e)); });
                    hls.on(Hls.Events.ERROR, function(event, data) { if (data.fatal) tryFallbackHLSPlayer(videoEl, link, playerId); });
                    window[`hls_${playerId}`] = hls;
                    const player = videojs(videoEl, { controls: true, fluid: true, html5: { nativeAudioTracks: false, nativeVideoTracks: false } });
                    window[`player_${playerId}`] = player;
                    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                }
                if (link && (link.includes('.mp4') || link.includes('.webm'))) {
                    const videoEl = document.createElement('video');
                    videoEl.id = playerId;
                    videoEl.className = 'video-js vjs-default-skin';
                    videoEl.setAttribute('controls', '');
                    videoEl.setAttribute('preload', 'auto');
                    videoEl.style.width = '100%'; videoEl.style.height = '100%'; videoEl.style.aspectRatio = '16/9';
                    wrapper.innerHTML = ''; wrapper.appendChild(videoEl);
                    const player = videojs(videoEl, { autoplay: true, controls: true, fluid: true, html5: { nativeAudioTracks: false, nativeVideoTracks: false } });
                    window[`player_${playerId}`] = player;
                    player.src({ src: link, type: 'video/mp4' });
                    player.play();
                    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                }
                wrapper.innerHTML = `<div style="padding:40px;text-align:center;color:#b33a3a;background:#0d1117;border-radius:12px;">⚠️ Unsupported video format.<br><small style="color:#6a7c94;">Supported: YouTube, HLS (.m3u8), MP4</small></div>`;
                wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        });
    }

    function tryFallbackHLSPlayer(videoEl, link, playerId) {
        if (window[`hls_${playerId}`]) { try { window[`hls_${playerId}`].destroy(); } catch(e) {} delete window[`hls_${playerId}`]; }
        const player = videojs(videoEl, {
            autoplay: true, controls: true, fluid: true,
            html5: { hls: { enableLowInitialPlaylist: true, smoothQualityChange: true, overrideNative: true }, nativeAudioTracks: false, nativeVideoTracks: false }
        });
        window[`player_${playerId}`] = player;
        if (link && link.includes('.m3u8')) player.src({ src: link, type: 'application/x-mpegURL' });
        else if (link) player.src({ src: link, type: 'video/mp4' });
        player.play();
    }

    // ===== CHECK SESSION =====
    function checkExistingSession() {
        if (!localStorage.getItem('timer_start')) localStorage.setItem('timer_start', Date.now().toString());
        if (checkGoogleSession()) {
            showVideoContent(); fetchPlaylists(); fetchImportantSection(); startSessionValidation(); return true;
        }
        const session = getSession();
        if (session && session.user) {
            currentUser = session.user;
            showVideoContent(); fetchPlaylists(); fetchImportantSection(); startSessionValidation(); return true;
        }
        return false;
    }

    // ===== DARK MODE =====
    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const btn = document.getElementById('themeToggle');
        if (document.body.classList.contains('dark-mode')) {
            btn.innerHTML = '☀️ Light Mode';
            localStorage.setItem('theme', 'dark');
        } else {
            btn.innerHTML = '🌙 Dark Mode';
            localStorage.setItem('theme', 'light');
        }
    }
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('themeToggle').innerHTML = '☀️ Light Mode';
    }

    // ===== EVENT LISTENERS =====
    document.getElementById('loginBtn').addEventListener('click', login);
    document.getElementById('loginKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    document.getElementById('loginEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    document.getElementById('genKeyBtn').addEventListener('click', generateKey);
    document.getElementById('genKeyEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') generateKey(); });
    document.getElementById('themeToggle').addEventListener('click', toggleDarkMode);

    // Mark All buttons
    SECTIONS.forEach(sectionKey => {
        const btn = document.getElementById('markAll-' + sectionKey);
        if (btn) {
            btn.addEventListener('click', function() {
                markAllWatchedForPlaylist(sectionKey);
            });
        }
    });

    document.querySelectorAll('.section-tab-btn').forEach(tabBtn => {
        tabBtn.addEventListener('click', function() {
            const sectionKey = this.dataset.section;
            document.querySelectorAll('.section-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            const panel = document.getElementById('sectionPanel-' + sectionKey);
            if (panel) panel.classList.add('active');
            if (sectionKey === 'starred') renderStarredTab();
        });
    });

    SECTIONS.forEach(sectionKey => {
        const dropdown = document.getElementById('playlistDropdown-' + sectionKey);
        const searchBtn = document.getElementById('searchBtn-' + sectionKey);
        const clearBtn = document.getElementById('clearSearchBtn-' + sectionKey);
        const searchInput = document.getElementById('searchInput-' + sectionKey);
        if (dropdown) {
            dropdown.addEventListener('change', function() {
                const selectedId = this.value;
                if (selectedId) {
                    sectionCurrentPlaylistId[sectionKey] = selectedId;
                    if (sectionKey === 'recorded') currentPlaylistId = selectedId;
                    renderSectionPlaylists(sectionKey);
                } else {
                    const container = document.getElementById('chaptersContainer-' + sectionKey);
                    if (container) container.innerHTML = `<div class="empty-state">Select a playlist from the dropdown</div>`;
                }
            });
        }
        if (searchBtn) searchBtn.addEventListener('click', () => searchSectionPlaylists(sectionKey));
        if (clearBtn) clearBtn.addEventListener('click', () => clearSectionSearch(sectionKey));
        if (searchInput) {
            searchInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') searchSectionPlaylists(sectionKey);
                if (e.key === 'Escape') clearSectionSearch(sectionKey);
            });
        }
    });

    // ===== DISPOSE =====
    window.addEventListener('beforeunload', function() {
        if (resetCheckInterval) clearInterval(resetCheckInterval);
        if (sessionValidationInterval) clearInterval(sessionValidationInterval);
        disposePlayer();
        for (let key in window) {
            if (key.startsWith('player_') && window[key] && typeof window[key].dispose === 'function') {
                try { window[key].dispose(); } catch(e) {}
            }
            if (key.startsWith('hls_') && window[key] && typeof window[key].destroy === 'function') {
                try { window[key].destroy(); } catch(e) {}
            }
        }
    });

    // ===== INIT =====
    if (!localStorage.getItem('timer_start')) localStorage.setItem('timer_start', Date.now().toString());
    const hasSession = checkExistingSession();
    if (!hasSession) {
        document.getElementById('loginContainer').style.display = 'block';
        document.getElementById('videoContent').style.display = 'none';
        document.getElementById('googleStatusBar').style.display = 'none';
        document.getElementById('userBar').style.display = 'none';
    }
    console.log('✅ Video Portal loaded - Picture-in-Picture removed, Google status bar above user bar');
})();
