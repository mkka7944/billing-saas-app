// === 20_premium_select.js ===
// Premium Select

const PremiumSelect = {
        init(id, options, defaultLabel, onChange) {
            const container = document.getElementById(id);
            if(!container) return;
            
            container.innerHTML = `
                <div class="custom-select-wrapper" id="${id}-wrapper">
                    <div class="custom-select-trigger">
                        <span class="trigger-text">${defaultLabel}</span>
                        <span class="material-icons-round">expand_more</span>
                    </div>
                    <div class="custom-select-options">
                        <div class="option-item active" data-value="all">${defaultLabel}</div>
                        ${options.map(opt => `<div class="option-item" data-value="${opt}">${opt}</div>`).join('')}
                    </div>
                </div>
            `;
            
            const wrapper = container.querySelector('.custom-select-wrapper');
            const trigger = wrapper.querySelector('.custom-select-trigger');
            
            trigger.onclick = (e) => {
                e.stopPropagation();
                const isOpen = wrapper.classList.contains('open');
                document.querySelectorAll('.custom-select-wrapper').forEach(el => el.classList.remove('open'));
                if(!isOpen) wrapper.classList.add('open');
            };
            
            wrapper.querySelectorAll('.option-item').forEach(item => {
                item.onclick = (e) => {
                    e.stopPropagation();
                    const val = item.getAttribute('data-value');
                    wrapper.querySelector('.trigger-text').innerText = item.innerText;
                    wrapper.classList.remove('open');
                    
                    wrapper.querySelectorAll('.option-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    
                    if(onChange) onChange(val);
                };
            });
            
            if(!window._psGlobal) {
                document.addEventListener('click', () => {
                    document.querySelectorAll('.custom-select-wrapper').forEach(el => el.classList.remove('open'));
                });
                window._psGlobal = true;
            }
        },
        getValue(id) {
            const wrapper = document.getElementById(`${id}-wrapper`);
            if(!wrapper) return 'all';
            const active = wrapper.querySelector('.option-item.active');
            return active ? active.getAttribute('data-value') : 'all';
        }
    };