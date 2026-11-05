import '@fontsource-variable/geist';
import './lib/styles/tokens.css';
import './lib/styles/base.css';
import './lib/styles/motion.css';
import { mount } from 'svelte';
import App from './App.svelte';
import TrayMenu from './TrayMenu.svelte';
import { initApi } from './lib/api';

await initApi();

// La même page sert la fenêtre principale et le menu de l'icône (index.html#tray).
mount(location.hash === '#tray' ? TrayMenu : App, { target: document.getElementById('app')! });
