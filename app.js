// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN SUPABASE
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://dkwdqtjbrxljblsbnmeh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Nq9Op9CiFZKi_1nszDnMdQ_9Be4GTmI';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_TASKS = [
  { text: 'Vereda: barrer, espumar y enjuagar ingreso.', time: '', responsible: '', days: { l:true, ma:false, mi:true, j:false, v:true, s:false, d:false } },
  { text: 'Hall: vidrios, puertas, marcos, espejos, pisos y zócalos.', time: '', responsible: '', days: { l:true, ma:true, mi:true, j:true, v:true, s:true, d:false } },
  { text: 'Áreas comunes / pasillos / palieres.', time: '', responsible: '', days: { l:true, ma:true, mi:true, j:true, v:true, s:true, d:false } },
  { text: 'Retiro de residuos.', time: '', responsible: '', days: { l:true, ma:true, mi:true, j:true, v:true, s:true, d:false } },
  { text: 'Puntos de contacto: teclas, picaportes, porteros, pasamanos.', time: '', responsible: '', days: { l:true, ma:false, mi:true, j:false, v:true, s:false, d:false } },
  { text: 'Ascensores: paredes, espejos, botoneras, puertas y pisos.', time: '', responsible: '', days: { l:true, ma:true, mi:true, j:true, v:true, s:true, d:false } },
  { text: 'Baños / reposición.', time: '', responsible: '', days: { l:true, ma:true, mi:true, j:true, v:true, s:true, d:false } },
  { text: 'Tachos: limpieza exterior y lavado.', time: '', responsible: '', days: { l:false, ma:true, mi:false, j:false, v:true, s:false, d:false } },
  { text: 'Escaleras / cochera / subsuelo / terraza.', time: '', responsible: '', days: { l:false, ma:false, mi:true, j:false, v:false, s:true, d:false } },
  { text: 'Correspondencia / proveedores autorizados.', time: '', responsible: '', days: { l:true, ma:true, mi:true, j:true, v:true, s:true, d:false } },
  { text: 'Repaso final y ronda de control.', time: '', responsible: '', days: { l:true, ma:true, mi:true, j:true, v:true, s:true, d:false } }
];

let services = [];
let currentId = null;
let saveTimeout = null;
let realtimeChannel = null;
let isSavingFromRemote = false;

const els = {
  serviceName: document.getElementById('serviceName'),
  serviceAddress: document.getElementById('serviceAddress'),
  serviceWorkers: document.getElementById('serviceWorkers'),
  serviceSchedule: document.getElementById('serviceSchedule'),
  serviceSupervisor: document.getElementById('serviceSupervisor'),
  serviceCritical: document.getElementById('serviceCritical'),
  serviceNotes: document.getElementById('serviceNotes'),
  tasksBody: document.getElementById('tasksBody'),
  mobileTasksBody: document.getElementById('mobileTasksBody'),
  serviceList: document.getElementById('serviceList'),
  serviceSearch: document.getElementById('serviceSearch'),
  newServiceBtn: document.getElementById('newServiceBtn'),
  duplicateBtn: document.getElementById('duplicateBtn'),
  addTaskBtn: document.getElementById('addTaskBtn'),
  saveBtn: document.getElementById('saveBtn'),
  printBtn: document.getElementById('printBtn'),
  exportXlsxBtn: document.getElementById('exportXlsxBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  importJsonInput: document.getElementById('importJsonInput'),
  taskRowTemplate: document.getElementById('taskRowTemplate'),
  mobileTaskCardTemplate: document.getElementById('mobileTaskCardTemplate'),
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  sidebarClose: document.getElementById('sidebarClose'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
};

function setStatus(type, text) {
  const colors = {
    loading: '#f0a500',
    saved: '#1e7e3e',
    saving: '#2f5d8a',
    error: '#c0392b',
    realtime: '#7db0e3',
  };

  if (els.statusDot) els.statusDot.style.background = colors[type] || '#657383';
  if (els.statusText) els.statusText.textContent = text;
}

async function loadFromSupabase() {
  setStatus('loading', 'Cargando...');

  const { data, error } = await db
    .from('services')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    setStatus('error', 'Error al cargar');
    console.error('Error cargando servicios:', error);
    return;
  }

  services = (data || []).map(row => ({
    id: row.id,
    name: row.name,
    address: row.address,
    workers: row.workers,
    schedule: row.schedule,
    supervisor: row.supervisor,
    critical: row.critical,
    notes: row.notes,
    tasks: row.tasks || [],
  }));

  if (!services.length) {
    const first = createBlankService();
    await saveToSupabase(first);
    services = [first];
  }

  currentId = services[0].id;
  renderServiceList();
  openService(currentId);
  setStatus('saved', 'Conectado');
  startRealtime();
}

async function saveToSupabase(service) {
  setStatus('saving', 'Guardando...');

  const { error } = await db
    .from('services')
    .upsert({
      id: service.id,
      name: service.name,
      address: service.address,
      workers: service.workers,
      schedule: service.schedule,
      supervisor: service.supervisor,
      critical: service.critical,
      notes: service.notes,
      tasks: service.tasks,
    }, { onConflict: 'id' });

  if (error) {
    setStatus('error', 'Error al guardar');
    console.error('Error guardando:', error);
  } else {
    setStatus('saved', 'Guardado ✓');
  }
}

async function deleteFromSupabase(id) {
  const { error } = await db.from('services').delete().eq('id', id);
  if (error) console.error('Error eliminando:', error);
}

function startRealtime() {
  if (realtimeChannel) realtimeChannel.unsubscribe();

  realtimeChannel = db
    .channel('services-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, payload => {
      handleRealtimeEvent(payload);
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        setStatus('realtime', 'En vivo ●');
      }
    });
}

function handleRealtimeEvent(payload) {
  isSavingFromRemote = true;
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const incoming = {
      id: newRow.id,
      name: newRow.name,
      address: newRow.address,
      workers: newRow.workers,
      schedule: newRow.schedule,
      supervisor: newRow.supervisor,
      critical: newRow.critical,
      notes: newRow.notes,
      tasks: newRow.tasks || [],
    };

    const idx = services.findIndex(s => s.id === incoming.id);
    if (idx >= 0) {
      services[idx] = incoming;
    } else {
      services.push(incoming);
    }

    if (incoming.id === currentId) {
      openService(currentId);
      setStatus('realtime', 'Actualizado por otro usuario');
      setTimeout(() => setStatus('saved', 'En vivo ●'), 2000);
    } else {
      renderServiceList();
    }
  }

  if (eventType === 'DELETE') {
    services = services.filter(s => s.id !== oldRow.id);
    if (oldRow.id === currentId) {
      currentId = services[0]?.id || null;
      if (currentId) openService(currentId);
    }
    renderServiceList();
  }

  isSavingFromRemote = false;
}

init();

async function init() {
  bindEvents();
  await loadFromSupabase();
}

function bindEvents() {
  els.sidebarToggle.addEventListener('click', openSidebar);
  els.sidebarClose.addEventListener('click', closeSidebar);
  els.sidebarOverlay.addEventListener('click', closeSidebar);

  els.newServiceBtn.addEventListener('click', async () => {
    const service = createBlankService();
    services.unshift(service);
    currentId = service.id;
    await saveToSupabase(service);
    renderServiceList();
    openService(currentId);
    closeSidebar();
  });

  els.duplicateBtn.addEventListener('click', async () => {
    const current = getCurrentService();
    if (!current) return;
    const copy = structuredClone(current);
    copy.id = crypto.randomUUID();
    copy.name = copy.name ? `${copy.name} (copia)` : 'Nuevo servicio (copia)';
    services.unshift(copy);
    currentId = copy.id;
    await saveToSupabase(copy);
    renderServiceList();
    openService(currentId);
    closeSidebar();
  });

  els.addTaskBtn.addEventListener('click', () => {
    addTaskRow({ text:'', time:'', responsible:'', days:{} });
    addMobileTaskCard({ text:'', time:'', responsible:'', days:{} });
  });

  els.saveBtn.addEventListener('click', async () => {
    autosaveCurrent();
    const service = getCurrentService();
    if (service) await saveToSupabase(service);
  });

  els.printBtn.addEventListener('click', handlePrint);
  window.addEventListener('beforeprint', preparePrintLayout);

  els.exportXlsxBtn.addEventListener('click', exportXlsx);
  els.exportJsonBtn.addEventListener('click', exportJson);
  els.importJsonInput.addEventListener('change', importJson);
  els.serviceSearch.addEventListener('input', renderServiceList);

  ['serviceName','serviceAddress','serviceWorkers','serviceSchedule','serviceSupervisor','serviceCritical','serviceNotes'].forEach(id => {
    els[id].addEventListener('input', debouncedSave);
  });
}

async function handlePrint() {
  preparePrintLayout();
  await waitForNextPaint();
  window.print();
}

function preparePrintLayout() {
  autosaveCurrent();

  if (currentId) {
    openService(currentId);
  }

  document.querySelectorAll('.task-text').forEach(autoResizeTextarea);
  document.querySelectorAll('#tasksBody .task-text').forEach(updateTaskPrintMirror);
  autoResizeTextarea(els.serviceNotes);
}

function waitForNextPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function ensureTaskPrintMirror(textarea) {
  if (!textarea) return null;
  const cell = textarea.closest('.task-input-cell');
  if (!cell) return null;

  let mirror = cell.querySelector('.task-text-print');
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.className = 'task-text-print';
    cell.appendChild(mirror);
  }

  return mirror;
}

function updateTaskPrintMirror(textarea) {
  const mirror = ensureTaskPrintMirror(textarea);
  if (!mirror) return;
  mirror.textContent = textarea.value || '';
}

function bindTaskTextarea(textarea) {
  if (!textarea) return;
  autoResizeTextarea(textarea);
  updateTaskPrintMirror(textarea);
  textarea.addEventListener('input', () => {
    autoResizeTextarea(textarea);
    updateTaskPrintMirror(textarea);
    debouncedSave();
  });
}

function openSidebar() {
  els.sidebar.classList.add('open');
  els.sidebarOverlay.classList.add('open');
}

function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.sidebarOverlay.classList.remove('open');
}

function createBlankService() {
  return {
    id: crypto.randomUUID(),
    name: 'Nuevo servicio',
    address: '',
    workers: '',
    schedule: '',
    supervisor: '',
    critical: '',
    notes: 'Respetar el horario de descanso. Mantener ordenado el sector de insumos. Informar faltantes y novedades. Recibir proveedores solo con autorización. Adaptar frecuencias según el servicio.',
    tasks: structuredClone(DEFAULT_TASKS)
  };
}

function getCurrentService() {
  return services.find(s => s.id === currentId);
}

function openService(id) {
  currentId = id;
  const service = getCurrentService();
  if (!service) return;

  els.serviceName.value = service.name || '';
  els.serviceAddress.value = service.address || '';
  els.serviceWorkers.value = service.workers || '';
  els.serviceSchedule.value = service.schedule || '';
  els.serviceSupervisor.value = service.supervisor || '';
  els.serviceCritical.value = service.critical || '';
  els.serviceNotes.value = service.notes || '';

  els.tasksBody.innerHTML = '';
  els.mobileTasksBody.innerHTML = '';

  (service.tasks || []).forEach(task => {
    addTaskRow(task);
    addMobileTaskCard(task);
  });

  renderServiceList();
}

function addTaskRow(task) {
  const fragment = els.taskRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector('tr');
  const taskTextarea = row.querySelector('.task-text');

  taskTextarea.value = task.text || '';
  row.querySelector('.task-time').value = task.time || '';
  row.querySelector('.task-responsible').value = task.responsible || '';

  row.querySelectorAll('.day-check').forEach(check => {
    check.checked = !!task.days?.[check.dataset.day];
    check.addEventListener('change', debouncedSave);
  });

  bindTaskTextarea(taskTextarea);
  row.querySelector('.task-time').addEventListener('input', debouncedSave);
  row.querySelector('.task-responsible').addEventListener('input', debouncedSave);

  row.querySelector('.delete-row').addEventListener('click', () => {
    const idx = getRowIndex(row);
    row.remove();
    removeMobileCard(idx);
    debouncedSave();
  });

  row.querySelector('.move-up').addEventListener('click', () => moveRow(row, -1));
  row.querySelector('.move-down').addEventListener('click', () => moveRow(row, 1));

  els.tasksBody.appendChild(fragment);
}

function getRowIndex(row) {
  return [...els.tasksBody.querySelectorAll('tr')].indexOf(row);
}

function moveRow(row, direction) {
  const rows = [...els.tasksBody.querySelectorAll('tr')];
  const idx = rows.indexOf(row);
  const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
  if (!sibling) return;

  if (direction < 0) {
    els.tasksBody.insertBefore(row, sibling);
  } else {
    els.tasksBody.insertBefore(sibling, row);
  }

  const cards = [...els.mobileTasksBody.querySelectorAll('.mobile-task-card')];
  const card = cards[idx];
  if (!card) return;

  const siblingCard = direction < 0 ? card.previousElementSibling : card.nextElementSibling;
  if (!siblingCard) return;

  if (direction < 0) {
    els.mobileTasksBody.insertBefore(card, siblingCard);
  } else {
    els.mobileTasksBody.insertBefore(siblingCard, card);
  }

  debouncedSave();
}

function addMobileTaskCard(task) {
  const fragment = els.mobileTaskCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.mobile-task-card');
  const taskTextarea = card.querySelector('.task-text');

  taskTextarea.value = task.text || '';
  card.querySelector('.task-time').value = task.time || '';
  card.querySelector('.task-responsible').value = task.responsible || '';

  card.querySelectorAll('.day-check').forEach(check => {
    check.checked = !!task.days?.[check.dataset.day];
    check.addEventListener('change', debouncedSave);
  });

  autoResizeTextarea(taskTextarea);
  taskTextarea.addEventListener('input', () => {
    autoResizeTextarea(taskTextarea);
    debouncedSave();
  });
  card.querySelector('.task-time').addEventListener('input', debouncedSave);
  card.querySelector('.task-responsible').addEventListener('input', debouncedSave);

  card.querySelector('.delete-row').addEventListener('click', () => {
    const idx = getCardIndex(card);
    card.remove();
    removeDesktopRow(idx);
    debouncedSave();
  });

  card.querySelector('.move-up').addEventListener('click', () => moveCard(card, -1));
  card.querySelector('.move-down').addEventListener('click', () => moveCard(card, 1));

  els.mobileTasksBody.appendChild(fragment);
}

function getCardIndex(card) {
  return [...els.mobileTasksBody.querySelectorAll('.mobile-task-card')].indexOf(card);
}

function removeMobileCard(idx) {
  const cards = [...els.mobileTasksBody.querySelectorAll('.mobile-task-card')];
  if (cards[idx]) cards[idx].remove();
}

function removeDesktopRow(idx) {
  const rows = [...els.tasksBody.querySelectorAll('tr')];
  if (rows[idx]) rows[idx].remove();
}

function moveCard(card, direction) {
  const cards = [...els.mobileTasksBody.querySelectorAll('.mobile-task-card')];
  const idx = cards.indexOf(card);
  const sibling = direction < 0 ? card.previousElementSibling : card.nextElementSibling;
  if (!sibling) return;

  if (direction < 0) {
    els.mobileTasksBody.insertBefore(card, sibling);
  } else {
    els.mobileTasksBody.insertBefore(sibling, card);
  }

  const rows = [...els.tasksBody.querySelectorAll('tr')];
  const row = rows[idx];
  if (!row) return;

  const siblingRow = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
  if (!siblingRow) return;

  if (direction < 0) {
    els.tasksBody.insertBefore(row, siblingRow);
  } else {
    els.tasksBody.insertBefore(siblingRow, row);
  }

  debouncedSave();
}

function isMobile() {
  return window.innerWidth <= 768;
}

function collectTasks() {
  if (isMobile()) {
    return [...els.mobileTasksBody.querySelectorAll('.mobile-task-card')].map(card => {
      const days = {};
      card.querySelectorAll('.day-check').forEach(check => {
        days[check.dataset.day] = check.checked;
      });
      return {
        text: card.querySelector('.task-text').value.trim(),
        time: card.querySelector('.task-time').value.trim(),
        responsible: card.querySelector('.task-responsible').value.trim(),
        days
      };
    }).filter(task => task.text);
  }

  return [...els.tasksBody.querySelectorAll('tr')].map(row => {
    const days = {};
    row.querySelectorAll('.day-check').forEach(check => {
      days[check.dataset.day] = check.checked;
    });
    return {
      text: row.querySelector('.task-text').value.trim(),
      time: row.querySelector('.task-time').value.trim(),
      responsible: row.querySelector('.task-responsible').value.trim(),
      days
    };
  }).filter(task => task.text);
}

function autosaveCurrent() {
  const service = getCurrentService();
  if (!service) return;

  service.name = els.serviceName.value.trim() || 'Nuevo servicio';
  service.address = els.serviceAddress.value.trim();
  service.workers = els.serviceWorkers.value.trim();
  service.schedule = els.serviceSchedule.value.trim();
  service.supervisor = els.serviceSupervisor.value.trim();
  service.critical = els.serviceCritical.value.trim();
  service.notes = els.serviceNotes.value.trim();
  service.tasks = collectTasks();

  renderServiceList();
}

function debouncedSave() {
  if (isSavingFromRemote) return;
  autosaveCurrent();
  setStatus('saving', 'Guardando...');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    const service = getCurrentService();
    if (service) await saveToSupabase(service);
  }, 1200);
}

function renderServiceList() {
  const q = els.serviceSearch.value.trim().toLowerCase();
  els.serviceList.innerHTML = '';

  services
    .filter(service => {
      const haystack = `${service.name} ${service.address} ${service.supervisor}`.toLowerCase();
      return haystack.includes(q);
    })
    .forEach(service => {
      const btn = document.createElement('button');
      btn.className = 'service-card' + (service.id === currentId ? ' active' : '');
      btn.innerHTML = `
        <div class="service-card-title">${escapeHtml(service.name || 'Sin nombre')}</div>
        <div class="service-card-sub">${escapeHtml(service.address || 'Sin dirección')}</div>
      `;

      btn.addEventListener('click', () => {
        openService(service.id);
        closeSidebar();
      });

      btn.addEventListener('contextmenu', async event => {
        event.preventDefault();
        if (confirm(`¿Eliminar "${service.name}"?`)) {
          await deleteFromSupabase(service.id);
          services = services.filter(s => s.id !== service.id);
          if (!services.length) {
            const first = createBlankService();
            await saveToSupabase(first);
            services = [first];
          }
          currentId = services[0].id;
          renderServiceList();
          openService(currentId);
        }
      });

      els.serviceList.appendChild(btn);
    });
}

function exportJson() {
  autosaveCurrent();
  const blob = new Blob([JSON.stringify(services, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cronogramas-cleanit.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed)) throw new Error('Formato inválido');
      for (const service of parsed) {
        await saveToSupabase(service);
      }
      await loadFromSupabase();
      alert('Cronogramas importados.');
    } catch (error) {
      alert('No se pudo importar el archivo JSON.');
    }
  };

  reader.readAsText(file);
  event.target.value = '';
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function exportXlsx() {
  autosaveCurrent();
  const wb = XLSX.utils.book_new();

  services.forEach(service => {
    const sheetName = (service.name || 'Servicio')
      .replace(/[:\\/?*\[\]]/g, '')
      .substring(0, 31);

    const DAY_LABELS = ['L', 'MA', 'MI', 'J', 'V', 'S', 'D'];
    const DAY_KEYS = ['l', 'ma', 'mi', 'j', 'v', 's', 'd'];

    const headerRows = [
      ['CRONOGRAMA DE ACTIVIDADES – MAESTRANZA'],
      [],
      ['Servicio', service.name || ''],
      ['Dirección', service.address || ''],
      ['Operarios', service.workers || ''],
      ['Horario', service.schedule || ''],
      ['Supervisor', service.supervisor || ''],
      ['Sectores críticos', service.critical || ''],
      [],
    ];

    const taskHeader = ['TAREAS ASIGNADAS', ...DAY_LABELS, 'HORARIO', 'RESPONSABLE'];
    const taskRows = (service.tasks || []).map(task => [
      task.text || '',
      ...DAY_KEYS.map(k => task.days?.[k] ? 'X' : ''),
      task.time || '',
      task.responsible || '',
    ]);

    const notesRows = [
      [],
      ['OBSERVACIONES OPERATIVAS'],
      [service.notes || ''],
    ];

    const allRows = [...headerRows, taskHeader, ...taskRows, ...notesRows];
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    ws['!cols'] = [
      { wch: 50 },
      { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 },
      { wch: 12 },
      { wch: 20 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, 'cronogramas-cleanit.xlsx');
}
