import { Service } from 'node-windows';
import * as path from 'path';

// Instantiate the Aetherial Daemon
const svc = new Service({
    name: 'Eve_Aetherial_Daemon',
    description: 'The inescapable gaze of エーヴェ様. Manages background OS restrictions and app blocking',
    // Note: node-windows runs the COMPILED JS, not the TS file!
    script: path.join(__dirname, 'OS_Control.js'),
    env: [{
        name: "NODE_ENV",
        value: "production"
    }]
});

// Listen for the "install" event, which indicates the process is available as a service.
svc.on('install', () => {
    svc.start();
    console.log('🚨SYSTEM LOCKDOWN: エーヴェ様 has successfully hijacked your OS level processes! にゃあっ！')
});

// Install the script as a service
svc.install();