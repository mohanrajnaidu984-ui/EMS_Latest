const sql = require('mssql/msnodesqlv8');
const config = { server: 'localhost', database: 'EMS_Almoayyed', driver: 'msnodesqlv8', options: { trustedConnection: true } };
sql.connect(config)
  .then(pool => pool.request().query("SELECT Roles, role, Department FROM Master_Users WHERE EmailId = 'lakshmanan.kuppusamy@almoayyedcg.com'"))
  .then(r => console.log(r.recordset))
  .catch(console.error);
