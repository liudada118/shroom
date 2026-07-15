export function disableRightMouseControl(controls, domElement) {
  if (controls?.mouseButtons) {
    controls.mouseButtons.RIGHT = null;
  }
  domElement?.addEventListener('contextmenu', preventContextMenu);
}

function preventContextMenu(event) {
  event.preventDefault();
}
