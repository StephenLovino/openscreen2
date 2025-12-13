{
  "targets": [
    {
      "target_name": "mouse_click_detector",
      "sources": [ "mouse-click-detector.cpp" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.13"
      },
      "conditions": [
        ["OS=='mac'", {
          "libraries": [
            "-framework ApplicationServices",
            "-framework CoreFoundation"
          ]
        }]
      ]
    }
  ]
}




