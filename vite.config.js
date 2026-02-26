import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                viewer: resolve(__dirname, 'viewer.html'),
                'capture-guide': resolve(__dirname, 'capture-guide.html'),
                'learn-ckd': resolve(__dirname, 'learn-ckd.html'),
                'learn-pd': resolve(__dirname, 'learn-pd.html'),
                'learn-comparison': resolve(__dirname, 'learn-comparison.html'),
                'learn-daily-life': resolve(__dirname, 'learn-daily-life.html'),
                'guide-setup': resolve(__dirname, 'guide-setup.html'),
                'guide-connect': resolve(__dirname, 'guide-connect.html'),
                'guide-troubleshooting': resolve(__dirname, 'guide-troubleshooting.html'),
                'guide-emergency': resolve(__dirname, 'guide-emergency.html'),
                'care-exit-site': resolve(__dirname, 'care-exit-site.html'),
                'care-infection': resolve(__dirname, 'care-infection.html'),
                'care-diet': resolve(__dirname, 'care-diet.html'),
                'care-checklist': resolve(__dirname, 'care-checklist.html'),
                'supply-gallery': resolve(__dirname, 'supply-gallery.html'),
                'supply-storage': resolve(__dirname, 'supply-storage.html'),
                'catheter-guide': resolve(__dirname, 'catheter-guide.html'),
                'gesture-trainer': resolve(__dirname, 'gesture-trainer.html'),
            },
        },
    },
    server: {
        host: true,
        port: 5173,
    },
    assetsInclude: ['**/*.glb', '**/*.usdz'],
});
