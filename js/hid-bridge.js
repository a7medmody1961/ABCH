'use strict';

/**
 * هذا الملف هو "الجسر" أو "الواجهة" (Interface)
 * هو المسؤول عن تحديد طريقة الاتصال بالهاردوير.
 * * - إذا كان الكود يعمل في متصفح ديسكتوب: سيستخدم WebHID.
 * - إذا كان الكود يعمل داخل غلاف تطبيق أندرويد (WebView): سيبحث عن `window.AndroidBridge`.
 * * باقي الكود (core.js, controller-manager.js) سيتعامل مع هذا الملف
 * كأنه هو `navigator.hid` مباشرة، مما يفصل اللوجيك عن طريقة التنفيذ.
 */

// --- 1. واجهة الأندرويد (Android Bridge Interface) ---
// هذا كلاس "بروكسي" (Proxy) يحاكي شكل `HIDDevice`
// ولكنه يمرر الأوامر إلى الكود الأصلي (Native) في الأندرويد.
class AndroidBridgeDevice {
    constructor(deviceInfo) {
        this.productId = deviceInfo.productId;
        this.vendorId = deviceInfo.vendorId;
        this.productName = deviceInfo.productName;
        this.opened = false;
        this.oninputreport = null; // سيقوم الأندرويد باستدعاء `window.hidInterface.onInputReport(data)`
        
        console.log(`[Bridge] تم إنشاء جهاز بروكسي للأندرويد: ${this.productName}`);
    }

    async open() {
        await window.AndroidBridge.open();
        this.opened = true;
    }

    async close() {
        await window.AndroidBridge.close();
        this.opened = false;
    }

    // الأوامر التي تُرسل من الـ JS إلى الأندرويد
    async sendFeatureReport(reportId, data) {
        // نحتاج تحويل `data` (اللي هو غالباً Uint8Array) إلى Base64
        // لأن الأندرويد بريدج يفضل التعامل مع النصوص
        const base64Data = btoa(String.fromCharCode.apply(null, data));
        return window.AndroidBridge.sendFeatureReport(reportId, base64Data);
    }

    // الأوامر التي تُرسل من الـ JS إلى الأندرويد
    async receiveFeatureReport(reportId) {
        const base64Data = await window.AndroidBridge.receiveFeatureReport(reportId);
        // الأندرويد سيعيد البيانات كـ Base64، فنقوم بفكها
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return new DataView(bytes.buffer);
    }
}

// --- 2. واجهة WebHID (الديسكتوب) ---
// هذه الواجهة تغلف `navigator.hid`
class WebHidBridge {
    constructor() {
        this.hid = navigator.hid;
        this.disconnectHandler = null;
        this.hid.addEventListener("disconnect", (e) => {
            if (this.disconnectHandler) {
                this.disconnectHandler(e);
            }
        });
    }

    isSupported() {
        return true;
    }

    onDisconnect(handler) {
        this.disconnectHandler = handler;
    }

    async getDevices() {
        return this.hid.getDevices();
    }

    async requestDevice(options) {
        // `requestDevice` يعيد مصفوفة من `HIDDevice`
        // هذه الأجهزة متوافقة مباشرة مع `base-controller.js`
        return this.hid.requestDevice(options);
    }
}

// --- 3. واجهة الأندرويد (الـ Native App) ---
// هذه الواجهة ستستخدم `window.AndroidBridge`
class AndroidBridge {
    constructor() {
        this.bridge = window.AndroidBridge;
        this.disconnectHandler = null;
        this.connectedDevice = null;
        
        // الأندرويد سيستدعي هذه الدوال
        window.hidInterface = {
            // الأندرويد يستدعي هذا عند وصول تقرير
            onInputReport: (base64Data) => {
                if (this.connectedDevice && this.connectedDevice.oninputreport) {
                    const binaryString = atob(base64Data);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    // إرسال البيانات إلى `controller-manager`
                    this.connectedDevice.oninputreport({ data: new DataView(bytes.buffer), device: this.connectedDevice });
                }
            },
            // الأندرويد يستدعي هذا عند فصل الدراع
            onDisconnect: () => {
                if (this.disconnectHandler) {
                    this.disconnectHandler({ device: this.connectedDevice });
                }
                this.connectedDevice = null;
            }
        };
    }

    isSupported() {
        return true;
    }

    onDisconnect(handler) {
        this.disconnectHandler = handler;
    }

    async getDevices() {
        // في الأندرويد، الاتصال يتم إدارته بواسطة التطبيق الأصلي
        // قد يرسل التطبيق قائمة بالأجهزة المتصلة عند بدء التشغيل
        return []; // في الغالب `requestDevice` هو الأهم
    }

    async requestDevice(options) {
        // نطلب من الأندرويد إظهار قائمة اختيار الأجهزة (OTG أو بلوتوث)
        // الـ `filters` يمكن إرسالها كـ JSON string
        const deviceInfoJson = await this.bridge.requestDevice(JSON.stringify(options.filters));
        
        if (deviceInfoJson) {
            const deviceInfo = JSON.parse(deviceInfoJson);
            this.connectedDevice = new AndroidBridgeDevice(deviceInfo);
            return [this.connectedDevice]; // يجب أن نعيد مصفوفة
        }
        return [];
    }
}


// --- 4. التصدير (Export) ---
// نقوم بتحديد أي واجهة سنستخدم
function createHidInterface() {
    if (window.AndroidBridge) {
        console.log("تم اكتشاف Android Bridge. جاري استخدام الواجهة الأصلية.");
        return new AndroidBridge();
    }
    if (navigator.hid) {
        console.log("تم اكتشاف WebHID. جاري استخدام واجهة المتصفح (ديسكتوب).");
        return new WebHidBridge();
    }
    console.warn("لم يتم العثور على WebHID أو Android Bridge.");
    return null;
}

// إنشاء وتصدير الواجهة الفعالة
export const hidInterface = createHidInterface();
