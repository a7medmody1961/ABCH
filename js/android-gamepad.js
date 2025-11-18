'use strict';

// ---
// هذا الملف يحتوي على كل اللوجيك الخاص بالـ Gamepad API
// وهو واجهة "للقراءة فقط" تُستخدم كبديل لـ WebHID على أندرويد
// ---

import { l } from './translations.js';

let controllerManager = null;
let uiCallback = null;
let uiSetupCallback = null;
let disconnectCallback = null;
let gamepadIndex = null;
let animationFrameId = null;
let lastBatteryText = "";

/**
 * هذا الماب مخصص لواجهة المستخدم (UI)
 * ليعرف أي زر في الواجهة يطابق أي اسم داخلي
 */
export const GAMEPAD_BUTTON_MAP = [
    { name: 'cross', svg: 'Cross' },
    { name: 'circle', svg: 'Circle' },
    { name: 'square', svg: 'Square' },
    { name: 'triangle', svg: 'Triangle' },
    { name: 'l1', svg: 'L1' },
    { name: 'r1', svg: 'R1' },
    { name: 'l2', svg: 'L2' }, // سيتم التعامل معه كـ analog
    { name: 'r2', svg: 'R2' }, // سيتم التعامل معه كـ analog
    { name: 'create', svg: 'Create' },
    { name: 'options', svg: 'Options' },
    { name: 'l3', svg: 'L3' },
    { name: 'r3', svg: 'R3' },
    { name: 'up', svg: 'Up' },
    { name: 'down', svg: 'Down' },
    { name: 'left', svg: 'Left' },
    { name: 'right', svg: 'Right' },
    { name: 'ps', svg: 'PS' },
    { name: 'touchpad', svg: 'Trackpad' },
    // 'mute' غير مدعوم في الـ standard mapping
];

/**
 * هذا الماب يترجم بيانات الـ Gamepad API (القياسية)
 * إلى الأسماء الداخلية المستخدمة في التطبيق
 */
const API_TO_APP_MAP = [
    { type: 'button', apiIndex: 0, name: 'cross' },
    { type: 'button', apiIndex: 1, name: 'circle' },
    { type: 'button', apiIndex: 2, name: 'square' },
    { type: 'button', apiIndex: 3, name: 'triangle' },
    { type: 'button', apiIndex: 4, name: 'l1' },
    { type: 'button', apiIndex: 5, name: 'r1' },
    { type: 'button', apiIndex: 10, name: 'l3' },
    { type: 'button', apiIndex: 11, name: 'r3' },
    { type: 'button', apiIndex: 8, name: 'create' },
    { type: 'button', apiIndex: 9, name: 'options' },
    { type: 'button', apiIndex: 12, name: 'up' },
    { type: 'button', apiIndex: 13, name: 'down' },
    { type: 'button', apiIndex: 14, name: 'left' },
    { type: 'button', apiIndex: 15, name: 'right' },
    { type: 'button', apiIndex: 16, name: 'ps' },
    { type: 'button', apiIndex: 17, name: 'touchpad' },
    // الأزرار الأنالوج
    { type: 'analog_button', apiIndex: 6, name: 'l2' },
    { type: 'analog_button', apiIndex: 7, name: 'r2' },
    // الأنالوج (Sticks)
    { type: 'axis', apiIndex: 0, name: 'lx' },
    { type: 'axis', apiIndex: 1, name: 'ly' },
    { type: 'axis', apiIndex: 2, name: 'rx' },
    { type: 'axis', apiIndex: 3, name: 'ry' },
];

/**
 * إعدادات الإدخال الوهمية التي يتم إرسالها إلى `handleControllerInput`
 * لضمان التوافق مع الواجهة الرسومية
 */
const GAMEPAD_INPUT_CONFIG = {
    buttonMap: GAMEPAD_BUTTON_MAP,
};

/**
 * يتم استدعاؤها عند توصيل دراع
 */
function handleGamepadConnected(e) {
    console.log('Gamepad connected:', e.gamepad.id);
    if (gamepadIndex !== null) {
        console.log('Already handling a gamepad.');
        return; // نحن نتعامل مع دراع واحد فقط
    }
    
    // تأكد أن الدراع يدعم الـ mapping القياسي
    if (e.gamepad.mapping !== 'standard') {
        console.warn('Gamepad does not support standard mapping, might not work correctly.');
    }

    gamepadIndex = e.gamepad.index;
    
    if (uiSetupCallback) {
        uiSetupCallback(e.gamepad.id);
    }
    
    pollGamepads();
}

/**
 * يتم استدعاؤها عند فصل الدراع
 */
function handleGamepadDisconnected(e) {
    console.log('Gamepad disconnected:', e.gamepad.id);
    if (e.gamepad.index === gamepadIndex) {
        stopGamepadPolling();
        gamepadIndex = null;
        if (disconnectCallback) {
            disconnectCallback(); // استدعاء دالة `disconnect` من `core.js`
        }
    }
}

/**
 * دالة التهيئة الرئيسية، يتم استدعاؤها من `core.js`
 */
export function initGamepadApi(manager, callback, setupCB, disconnectCB) {
    controllerManager = manager;
    uiCallback = callback;
    uiSetupCallback = setupCB;
    disconnectCallback = disconnectCB;
    
    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    // التحقق مما إذا كان هناك دراع متصل بالفعل عند تحميل الصفحة
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gamepad of gamepads) {
        if (gamepad) {
            handleGamepadConnected({ gamepad });
            break; // الاتصال بأول دراع نجده
        }
    }
}

/**
 * إيقاف حلقة القراءة
 */
export function stopGamepadPolling() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

/**
 * حلقة القراءة الرئيسية (Game Loop)
 */
function pollGamepads() {
    if (gamepadIndex === null) return;
    
    const gamepads = navigator.getGamepads();
    const gamepad = gamepads[gamepadIndex];
    
    if (!gamepad) {
        stopGamepadPolling();
        // قد يكون تم فصله، انتظر الحدث
        return;
    }

    const changes = {};
    const { button_states } = controllerManager;

    // 1. معالجة الأنالوج (Sticks)
    const newSticks = {
        left: { x: gamepad.axes[0] || 0, y: gamepad.axes[1] || 0 },
        right: { x: gamepad.axes[2] || 0, y: gamepad.axes[3] || 0 }
    };
    
    // التحقق مما إذا كانت هناك تغييرات
    if (button_states.sticks.left.x !== newSticks.left.x || button_states.sticks.left.y !== newSticks.left.y ||
        button_states.sticks.right.x !== newSticks.right.x || button_states.sticks.right.y !== newSticks.right.y) {
        button_states.sticks = newSticks;
        changes.sticks = newSticks;
    }

    // 2. معالجة الأزرار
    for (const mapping of API_TO_APP_MAP) {
        if (mapping.type === 'button') {
            const pressed = gamepad.buttons[mapping.apiIndex]?.pressed || false;
            if (button_states[mapping.name] !== pressed) {
                button_states[mapping.name] = pressed;
                changes[mapping.name] = pressed;
            }
        } else if (mapping.type === 'analog_button') {
            const value = Math.round((gamepad.buttons[mapping.apiIndex]?.value || 0) * 255);
            const key = mapping.name + '_analog';
            if (button_states[key] !== value) {
                button_states[key] = value;
                changes[key] = value;
            }
            
            // تحديث الحالة الرقمية (pressed/not pressed) للـ Triggers
            const pressed = value > 10; // (threshold)
            if (button_states[mapping.name] !== pressed) {
                button_states[mapping.name] = pressed;
                changes[mapping.name] = pressed;
            }
        }
    }
    
    // 3. البطارية (وهمي، لأن الـ Gamepad API غير موثوق في هذا)
    let bat_txt = l("N/A"); // "غير متاح"
    let batteryChanged = bat_txt !== lastBatteryText;
    lastBatteryText = bat_txt;

    const batteryStatus = {
        bat_txt: bat_txt,
        changed: batteryChanged,
        bat_capacity: 0,
        cable_connected: false,
        is_charging: false,
        is_error: true // لإظهار "N/A"
    };
    
    // 4. لوحة اللمس (غير مدعومة)
    const touchPoints = [];

    // 5. استدعاء الـ callback الرئيسي في `core.js` لتحديث الواجهة
    if (Object.keys(changes).length > 0 || batteryChanged) {
        uiCallback({
            changes,
            inputConfig: GAMEPAD_INPUT_CONFIG,
            touchPoints,
            batteryStatus
        });
    }

    // الاستمرار في الحلقة
    animationFrameId = requestAnimationFrame(pollGamepads);
}
