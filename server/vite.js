const express = require('express');
const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

async function setupVite(app) {
  if (isProduction) {
    // Production: serve pre-built dist/ directory
    const distPath = path.resolve(__dirname, '../dist');
    
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      
      // SPA fallback: serve index.html for all non-API routes
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
          return next();
        }
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
      
      console.log('✅ Serving production build from dist/');
    } else {
      console.warn('⚠️ Production build not found at dist/. Run `npm run build` first.');
    }
  } else {
    // Development: use Vite dev server middleware
    const { createServer } = await import('vite');
    
    const vite = await createServer({
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '../src'),
          '@assets': path.resolve(__dirname, '../attached_assets'),
        },
      },
      server: { 
        middlewareMode: true,
        host: '0.0.0.0',
        hmr: {
          clientPort: 443,
        },
        allowedHosts: [
          '.replit.dev',
          '.repl.co',
          '.replit.app',
          'gestion.nadakiexcursions.com',
        ],
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);

    // SPA fallback for development
    app.get('*', async (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }

      const url = req.originalUrl;

      try {
        // Read index.html
        const template = fs.readFileSync(
          path.resolve(__dirname, '../index.html'),
          'utf-8'
        );

        // Apply Vite HTML transforms
        const html = await vite.transformIndexHtml(url, template);

        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
    
    console.log('✅ Vite dev server middleware enabled');
  }
}

module.exports = { setupVite };
