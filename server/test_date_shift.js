const offset = new Date().getTimezoneOffset();
console.log("Current Timezone Offset (mins):", offset);

const d1 = new Date('2026-02-24');
console.log("new Date('2026-02-24'):", d1.toString());
console.log("d1.toISOString():", d1.toISOString());
console.log("split result:", d1.toISOString().split('T')[0]);

const d2 = new Date('2026-02-24T00:00:00');
console.log("new Date('2026-02-24T00:00:00'):", d2.toString());
console.log("d2.toISOString():", d2.toISOString());
console.log("split result:", d2.toISOString().split('T')[0]);
