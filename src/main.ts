import '@fontsource-variable/geist';
import './lib/styles/tokens.css';
import './lib/styles/base.css';
import './lib/styles/motion.css';
import { mount } from 'svelte';
import App from './App.svelte';
import TrayMenu from './TrayMenu.svelte';
import { initApi } from './lib/api';
import { isLinux } from './lib/util/platform';

// Linux : WebKitGTK calcule les flous sans le GPU, base.css les retire (classe `linux`).
if (isLinux) document.documentElement.classList.add('linux');

await initApi();

// La même page sert la fenêtre principale et le menu de l'icône (index.html#tray).
mount(location.hash === '#tray' ? TrayMenu : App, { target: document.getElementById('app')! });
