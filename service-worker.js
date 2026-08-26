// Service Worker - 车队单证管理系统 PWA
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `fleet-docs-${CACHE_VERSION}`;
const OFFLINE_URL = './dashboard.html';

// 需要预缓存的核心资源
const PRECACHE_URLS = [
  './',
  './dashboard.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// 安装阶段：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn('[SW] 部分资源预缓存失败:', err);
          // 即使部分失败也继续，不阻断安装
          return Promise.resolve();
        });
      })
      .then(() => self.skipWaiting())
  );
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('fleet-docs-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截：缓存优先策略（HTML使用网络优先，其他资源缓存优先）
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 跨域请求（如 GitHub API、飞书 API 等）不缓存，直接走网络
  if (url.origin !== self.location.origin) return;

  // HTML 页面：网络优先，失败则回退到缓存
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 成功响应则更新缓存
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // 网络失败，从缓存取
          return caches.match(request).then((cached) => {
            return cached || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // 图片、字体、CSS、JS 等静态资源：缓存优先，缓存中没有再网络请求并缓存
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // 只缓存成功的响应
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // 图片失败时返回占位图
          if (request.destination === 'image') {
            return new Response('', { status: 408, statusText: 'Offline' });
          }
          return new Response('离线状态，请检查网络连接', { status: 503 });
        });
    })
  );
});

// 接收来自页面的消息（如手动更新）
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});
