(async ()=>{
  try {
    const base = 'http://localhost:3005/api';
    const loginRes = await fetch(base + '/auth/login', {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ email: 'hod@crambrunch.com', password: 'Hod@123' })
    });
    const login = await loginRes.json();
    if (!login.success) return console.error('Login failed', login);
    const token = login.token;
    console.log('TOKEN:', token);

    const dept = login.user.department || '';
    const sem = login.user.semester || '';
    const studentsRes = await fetch(base + '/students?department=' + encodeURIComponent(dept) + (sem ? '&semester=' + sem : ''), {
      headers: { Authorization: 'Bearer ' + token }
    });
    const students = await studentsRes.json();
    console.log('STUDENTS COUNT:', (students.data && students.data.length) || 0);
    if (!(students.data && students.data.length)) return console.log('No students to assign');

    const id = students.data[0]._id;
    console.log('CHOSEN ID:', id, 'NAME:', students.data[0].name);

    const selRes = await fetch(base + '/students/' + id + '/select-cr', {
      method: 'POST', headers: { 'Content-Type':'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({})
    });
    const sel = await selRes.json();
    console.log('SELECT-CR RESPONSE:', sel);

    // fetch student to confirm
    const stuRes = await fetch(base + '/students/' + id, { headers: { Authorization: 'Bearer ' + token } });
    const stu = await stuRes.json();
    console.log('STUDENT AFTER ASSIGN:', stu);
  } catch (err) {
    console.error('Error', err);
  }
})();
