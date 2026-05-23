// === 25_ui_interactions.js ===
// UIInteractions + bootstrap

const UIInteractions = {
    setupDraggable(el, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            el.style.transition = 'none';
            el.dataset.dragged = "true";
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            let newTop = el.offsetTop - pos2;
            let newLeft = el.offsetLeft - pos1;

            // Contain within viewport
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 50));
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 50));

            el.style.top = newTop + "px";
            el.style.left = newLeft + "px";
            el.style.bottom = 'auto';
            el.style.right = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            el.style.transition = '';
        }
    },
    toggleExtraCtrls(forceHide = false) {
        const ctrls = document.getElementById('extra-ctrls');
        const btn = document.getElementById('toggle-ctrls-btn');
        if (!ctrls || !btn) return;

        if (forceHide) {
            if (!ctrls.classList.contains('collapsed')) {
                console.log("Toolbar: Force hiding via JS class");
                ctrls.classList.add('collapsed');
            }
            btn.querySelector('span').innerText = 'expand_more';
            return;
        }

        const isCollapsed = ctrls.classList.toggle('collapsed');
        console.log("Toolbar state:", isCollapsed ? "Collapsed" : "Expanded");
        btn.querySelector('span').innerText = isCollapsed ? 'expand_more' : 'expand_less';
    },
    setupResizable(el, handle) {
        handle.onmousedown = initResize;

        function initResize(e) {
            e.preventDefault();
            window.addEventListener('mousemove', Resize, false);
            window.addEventListener('mouseup', stopResize, false);
            el.style.transition = 'none';
        }

        function Resize(e) {
            const newWidth = Math.max(280, e.clientX - el.offsetLeft);
            const newHeight = Math.max(200, e.clientY - el.offsetTop);
            el.style.width = newWidth + 'px';
            el.style.height = newHeight + 'px';
            el.style.bottom = 'auto';
            el.style.right = 'auto';
            el.dataset.prevHeight = newHeight + 'px';
        }

        function stopResize(e) {
            window.removeEventListener('mousemove', Resize, false);
            window.removeEventListener('mouseup', stopResize, false);
            el.style.transition = '';
        }
    }
};

window.UIInteractions = UIInteractions;
