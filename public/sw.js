// Service Worker for Nadaki Excursions Portal - PWA
const CACHE_NAME = 'nadaki-portal-v2';
const urlsToCache = [
  '/dashboard.html',
  '/dashboard.css',
  '/dashboard.js',
  '/captain.html',
  '/captain.css',
  '/captain.js',
  '/commissions.html',
  '/commissions.css',
  '/commissions.js',
  '/schedule.html',
  '/schedule.css',
  '/schedule.js',
  '/pricing.html',
  '/pricing.css',
  '/pricing.js',
  '/dynamic-pricing.html',
  '/dynamic-pricing.js',
  '/accounting.html',
  '/accounting.js',
  '/messages.html',
  '/messages.js',
  '/boat-maintenance.html',
  '/boat-maintenance.js',
  '/marine-conditions.html',
  '/marine-conditions.js',
  '/fleet.html',
  '/fleet.js',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching app shell...');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Cache failed:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API requests - always go to network
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Check if valid response
        if (!response || response.status !== 200) {
          return response;
        }
        
        // Clone the response
        const responseToCache = response.clone();
        
        // Cache successful responses
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });
        
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request);
      })
  );
});

// Handle background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nueva notificación de Nadaki',
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/dashboard.html'
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Nadaki Excursions', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/dashboard.html')
  );
});
