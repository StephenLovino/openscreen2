#include <napi.h>
#include <ApplicationServices/ApplicationServices.h>

// Global event tap reference
static CFMachPortRef eventTap = NULL;
static CFRunLoopSourceRef runLoopSource = NULL;
static Napi::FunctionReference callbackRef;

// Event tap callback function
CGEventRef eventTapCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
    // Only process mouse button events
    if (type == kCGEventLeftMouseDown || type == kCGEventRightMouseDown || type == kCGEventOtherMouseDown) {
        // Get mouse location
        CGPoint location = CGEventGetLocation(event);
        
        // Get the callback function from the reference
        Napi::Env env = callbackRef.Env();
        Napi::HandleScope scope(env);
        
        // Create JavaScript callback arguments
        Napi::Object clickData = Napi::Object::New(env);
        clickData.Set("x", Napi::Number::New(env, location.x));
        clickData.Set("y", Napi::Number::New(env, location.y));
        clickData.Set("timestamp", Napi::Number::New(env, CGEventGetTimestamp(event) / 1000000.0)); // Convert to milliseconds
        
        // Call the JavaScript callback
        callbackRef.Call({clickData});
    }
    
    // Return the event (pass it through)
    return event;
}

// Start mouse click detection
Napi::Value StartDetection(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Callback function required").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Store the callback function
    callbackRef = Napi::Persistent(info[0].As<Napi::Function>());
    
    // Create event tap
    CGEventMask eventMask = (1 << kCGEventLeftMouseDown) | 
                           (1 << kCGEventRightMouseDown) | 
                           (1 << kCGEventOtherMouseDown);
    
    eventTap = CGEventTapCreate(
        kCGSessionEventTap,
        kCGHeadInsertEventTap,
        kCGEventTapOptionDefault,
        eventMask,
        eventTapCallback,
        NULL
    );
    
    if (!eventTap) {
        callbackRef.Release();
        Napi::Error::New(env, "Failed to create event tap. Please grant accessibility permissions in System Preferences > Security & Privacy > Accessibility.").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Check if the event tap is enabled (requires accessibility permissions)
    if (!CGEventTapIsEnabled(eventTap)) {
        CFRelease(eventTap);
        eventTap = NULL;
        callbackRef.Release();
        Napi::Error::New(env, "Event tap is not enabled. Please grant accessibility permissions in System Preferences > Security & Privacy > Accessibility.").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Create run loop source
    runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, kCFRunLoopCommonModes);
    
    // Enable the event tap
    CGEventTapEnable(eventTap, true);
    
    return Napi::Boolean::New(env, true);
}

// Stop mouse click detection
Napi::Value StopDetection(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (eventTap) {
        CGEventTapEnable(eventTap, false);
        eventTap = NULL;
    }
    
    if (runLoopSource) {
        CFRunLoopRemoveSource(CFRunLoopGetCurrent(), runLoopSource, kCFRunLoopCommonModes);
        CFRelease(runLoopSource);
        runLoopSource = NULL;
    }
    
    if (!callbackRef.IsEmpty()) {
        callbackRef.Release();
    }
    
    return Napi::Boolean::New(env, true);
}

// Initialize the addon
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "startDetection"), Napi::Function::New(env, StartDetection));
    exports.Set(Napi::String::New(env, "stopDetection"), Napi::Function::New(env, StopDetection));
    return exports;
}

NODE_API_MODULE(mouse_click_detector, Init)

