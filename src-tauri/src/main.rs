// Main entry point
// 如果当前是 Release 发布模式，那么就告诉 Windows，不要额外弹出黑色控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//#![...]用于配置整个 Rust 程序或库，而不是单独配置某个函数。
fn main() {
    damaoapi_lib::run();
}
