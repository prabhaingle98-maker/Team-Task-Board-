const API = window.location.origin + '/api';

let tasks = [];
let editingId = null;

async function checkAuth() {
  const res = await fetch(API + '/me', { credentials: 'include' });
  const user = await res.json();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }
  document.getElementById('userName').textContent = user.username;
  if (user.is_admin) {
    document.getElementById('adminLink').style.display = 'inline';
  }
  loadTasks();
  setInterval(function() {
    if (!document.getElementById('modalOverlay').classList.contains('show')) {
      loadTasks();
    }
  }, 3000);
}

async function logout() {
  await fetch(API + '/logout', { method: 'POST', credentials: 'include' });
  window.location.href = '/login.html';
}

async function loadTasks() {
  const res = await fetch(API + '/tasks', { credentials: 'include' });
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  tasks = await res.json();
  render();
}

function render() {
  ['todo', 'doing', 'done'].forEach(function(s) {
    document.getElementById(s).innerHTML = '';
  });

  const counts = { todo: 0, doing: 0, done: 0 };

  tasks.forEach(function(task) {
    counts[task.status]++;
    const el = document.createElement('div');
    el.className = 'task';
    el.draggable = true;
    el.dataset.id = task.id;

    const isOverdue = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString()) && task.status !== 'done';
    if (isOverdue) el.classList.add('overdue');

    const titleRow = document.createElement('div');
    titleRow.className = 'task-title-row';

    const dragIcon = document.createElement('span');
    dragIcon.innerHTML = '<svg class="drag-handle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
    titleRow.appendChild(dragIcon);

    const h3 = document.createElement('h3');
    h3.textContent = task.title;
    titleRow.appendChild(h3);

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    if (task.status !== 'done') {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit';
      editBtn.title = 'Edit';
      editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
      editBtn.onclick = function() { editTask(task.id); };
      actions.appendChild(editBtn);
    }

    const moveBtn = document.createElement('button');
    moveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
    moveBtn.onclick = function(e) { e.stopPropagation(); showMoveMenu(task.id); };
    actions.appendChild(moveBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete';
    delBtn.title = 'Delete';
    delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    delBtn.onclick = function() { deleteTask(task.id); };
    actions.appendChild(delBtn);

    const header = document.createElement('div');
    header.className = 'task-header';
    header.appendChild(titleRow);
    header.appendChild(actions);
    el.appendChild(header);

    if (task.description) {
      const desc = document.createElement('p');
      desc.className = 'task-description';
      desc.textContent = task.description;
      el.appendChild(desc);
    }

    const footer = document.createElement('div');
    footer.className = 'task-footer';

    const priority = document.createElement('span');
    priority.className = 'priority ' + task.priority;
    priority.textContent = task.priority;
    footer.appendChild(priority);

    const meta = document.createElement('div');
    meta.className = 'task-meta';

    if (task.due_date) {
      const due = document.createElement('span');
      if (isOverdue) due.className = 'overdue';
      due.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ' + formatDate(task.due_date) + (isOverdue ? ' (overdue)' : '');
      meta.appendChild(due);
    }

    if (task.assignee) {
      const assign = document.createElement('span');
      assign.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ' + task.assignee;
      meta.appendChild(assign);
    }

    footer.appendChild(meta);
    el.appendChild(footer);

    el.addEventListener('dragstart', dragStart);
    el.addEventListener('dragend', dragEnd);
    document.getElementById(task.status).appendChild(el);
  });

  document.getElementById('taskCount').textContent = tasks.length + ' tasks total';
  document.getElementById('count-todo').textContent = counts.todo;
  document.getElementById('count-doing').textContent = counts.doing;
  document.getElementById('count-done').textContent = counts.done;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showMoveMenu(taskId) {
  const task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;

  const statuses = ['todo', 'doing', 'done'];
  const labels = { todo: 'To Do', doing: 'Doing', done: 'Done' };

  let html = '';
  statuses.forEach(function(s) {
    if (s !== task.status) {
      html += '<button onclick="moveTask(' + taskId + ', \'' + s + '\')">Move to ' + labels[s] + '</button>';
    }
  });

  const existing = document.getElementById('moveMenu');
  if (existing) existing.remove();

  const btn = event.target.closest('button');
  const rect = btn.getBoundingClientRect();

  const menu = document.createElement('div');
  menu.id = 'moveMenu';
  menu.className = 'move-menu show';
  menu.style.position = 'fixed';
  menu.style.top = (rect.bottom + 5) + 'px';
  menu.style.left = rect.left + 'px';
  menu.style.zIndex = '9999';
  menu.innerHTML = html;
  document.body.appendChild(menu);

  setTimeout(function() {
    document.addEventListener('click', function closeMenu(e) {
      if (!e.target.closest('#moveMenu')) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  }, 10);
}

function openModal() {
  editingId = null;
  clearInputs();
  document.getElementById('modalTitle').textContent = 'Add Task';
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  const menu = document.getElementById('moveMenu');
  if (menu) menu.remove();
}

function editTask(id) {
  const task = tasks.find(function(t) { return t.id === id; });
  if (!task) return;

  document.getElementById('title').value = task.title;
  document.getElementById('description').value = task.description || '';
  document.getElementById('priority').value = task.priority;
  document.getElementById('assignee').value = task.assignee || '';
  document.getElementById('start_date').value = task.start_date || '';
  document.getElementById('due_date').value = task.due_date || '';

  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Task';
  document.getElementById('modalOverlay').classList.add('show');
}

async function saveTask() {
  const title = document.getElementById('title').value.trim();
  if (!title) return alert('Title required');

  const task = {
    title: title,
    description: document.getElementById('description').value,
    priority: document.getElementById('priority').value,
    assignee: document.getElementById('assignee').value,
    start_date: document.getElementById('start_date').value,
    due_date: document.getElementById('due_date').value,
    completion_date: document.getElementById('completion_date').value
  };

  if (editingId) {
    const existing = tasks.find(function(t) { return t.id === editingId; });
    await fetch(API + '/tasks/' + editingId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(Object.assign({}, task, { status: existing.status }))
    });
    editingId = null;
  } else {
    await fetch(API + '/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(task)
    });
  }

  closeModal();
  loadTasks();
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await fetch(API + '/tasks/' + id, { method: 'DELETE', credentials: 'include' });
  loadTasks();
}

async function moveTask(id, newStatus) {
  const task = tasks.find(function(t) { return t.id === id; });
  if (!task) return;

  const updated = Object.assign({}, task, { status: newStatus });
  if (newStatus === 'done' && !task.completion_date) {
    updated.completion_date = new Date().toISOString().split('T')[0];
  }

  await fetch(API + '/tasks/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updated)
  });

  const menu = document.getElementById('moveMenu');
  if (menu) menu.remove();
  loadTasks();
}

function clearInputs() {
  document.getElementById('title').value = '';
  document.getElementById('description').value = '';
  document.getElementById('priority').value = 'medium';
  document.getElementById('assignee').value = '';
  document.getElementById('start_date').value = '';
  document.getElementById('due_date').value = '';
}

let draggedId = null;

function dragStart(e) {
  draggedId = +e.target.dataset.id;
  e.target.classList.add('dragging');
}

function dragEnd(e) {
  e.target.classList.remove('dragging');
  draggedId = null;
}

document.querySelectorAll('.column').forEach(function(col) {
  col.addEventListener('dragover', function(e) {
    e.preventDefault();
    col.classList.add('drag-over');
  });
  col.addEventListener('dragleave', function() { col.classList.remove('drag-over'); });
  col.addEventListener('drop', async function(e) {
    e.preventDefault();
    col.classList.remove('drag-over');
    if (!draggedId) return;

    const newStatus = col.dataset.status;
    const task = tasks.find(function(t) { return t.id === draggedId; });
    if (task && task.status !== newStatus) {
      const updated = Object.assign({}, task, { status: newStatus });
      if (newStatus === 'done' && !task.completion_date) {
        updated.completion_date = new Date().toISOString().split('T')[0];
      }
      await fetch(API + '/tasks/' + draggedId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updated)
      });
      loadTasks();
    }
  });
});

checkAuth();
