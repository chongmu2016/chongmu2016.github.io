// sw.js

const CACHE_VERSION = 'v16'; // 此版本號應與 index.html 中的 PWA_SW_VERSION 保持一致
const CACHE_NAME = `pet-salon-pwa-cache-${CACHE_VERSION}`;

// APP 安裝時需要立即快取的核心檔案
const APP_SHELL = [
    '/',
    'index.html',
    'manifest.json',
    'line.png',
    'https://ptwvmgarrwygphmahsoo.supabase.co/storage/v1/object/public/logo/line_oa_chat_260504_153145.jpg',
    'https://unpkg.com/lucide@latest',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.1/dist/umd/supabase.js',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@300;400;500;700;900&family=Cormorant+Garamond:wght@400;600&display=swap'
];

// install 事件：快取 App Shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching App Shell');
            const cachePromises = APP_SHELL.map(url => {
                // 使用 'reload' 確保我們快取的是最新的網路資源，而非瀏覽器舊快取
                return cache.add(new Request(url, { cache: 'reload' })).catch(err => {
                    console.warn(`[SW] Failed to cache ${url}:`, err);
                });
            });
            return Promise.all(cachePromises);
        })
    );
});

// activate 事件：清除舊快取並讓 SW 立即接管頁面
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // 刪除所有不是目前版本的快取
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('pet-salon-pwa-cache')) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // 立即控制所有客戶端
    );
});

// fetch 事件：根據請求類型決定快取策略
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // 忽略非 GET 請求 (如 POST) 或 Supabase API 請求
    if (request.method !== 'GET' || request.url.includes('/rest/v1/') || request.url.includes('/functions/v1/')) {
        event.respondWith(fetch(request));
        return;
    }

    // 對於 HTML 導航請求，採用 "Network First" 策略
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // 成功從網路取得後，更新快取
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // 網路失敗時，從快取中尋找
                    return caches.match(request).then(cachedResponse => {
                        return cachedResponse || caches.match('/index.html'); // 最差情況下返回首頁
                    });
                })
        );
        return;
    }

    // 對於其他靜態資源 (CSS, JS, 圖片)，採用 "Cache First" 策略
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            // 若快取中存在，直接返回
            if (cachedResponse) {
                return cachedResponse;
            }

            // 若快取中不存在，從網路擷取，存入快取後再返回
            return fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(error => {
                console.error('[SW] Fetch failed for:', request.url, error);
            });
        })
    );
});

// message 事件：接收來自客戶端的指令
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting(); // 啟用新的 Service Worker
    }
});