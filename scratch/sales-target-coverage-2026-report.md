# 2026 division sales-target coverage

Checked: 11 November 2026. All amounts are BHD. Read-only database review; no records were changed.

Requirement: sum of all engineer/item/quarter TargetValue must be at least the annual division commit_Target.Revenue; sum of TargetValue × GrossProfitTarget / 100 must be at least commit_Target.GpValue. Equality passes. GP percentages are not summed. Actual won bookings are not the annual commitment baseline.

{"No sales targets entered":14,"Name mapping required":2,"Meets both commitments":7,"Below commitment":2}

| Division | Annual booking commitment | Entered booking target | Booking shortfall | Annual GP commitment | Entered GP target | GP shortfall | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| AC Maint-HVAC | 11,400,000.00 | 0.00 | 11,400,000.00 | 2,034,000.00 | 0.00 | 2,034,000.00 | No sales targets entered |
| Almoayyed Aluminium | 1,607,000.00 | 0.00 | 1,607,000.00 | 193,750.00 | 0.00 | 193,750.00 | No sales targets entered |
| Almoayyed Transport | 2,700,000.00 | 0.00 | 2,700,000.00 | 594,000.00 | 0.00 | 594,000.00 | No sales targets entered |
| Almoayyed Watersolution | 100,000.00 | 0.00 | 100,000.00 | 46,800.00 | 0.00 | 46,800.00 | Name mapping required |
| BMS Maint | 140,000.00 | 360,000.00 | 0.00 | 56,000.00 | 72,000.00 | 0.00 | Meets both commitments |
| BMS Project | 1,437,000.00 | 2,200,000.00 | 0.00 | 252,000.00 | 390,000.00 | 0.00 | Meets both commitments |
| Civil Maint | 3,036,000.00 | 0.00 | 3,036,000.00 | 331,500.00 | 0.00 | 331,500.00 | No sales targets entered |
| Civil Project | 26,404,000.00 | 0.00 | 26,404,000.00 | 2,622,000.00 | 0.00 | 2,622,000.00 | No sales targets entered |
| Cleaning Maint | 3,600,000.00 | 0.00 | 3,600,000.00 | 504,000.00 | 0.00 | 504,000.00 | No sales targets entered |
| Designers Gallery | 550,000.00 | 0.00 | 550,000.00 | 79,000.00 | 0.00 | 79,000.00 | No sales targets entered |
| Direct Sales | 4,000,000.00 | 0.00 | 4,000,000.00 | 425,000.00 | 0.00 | 425,000.00 | Name mapping required |
| Duct Factory | 995,000.00 | 1,000,000.00 | 0.00 | 149,250.00 | 142,000.00 | 7,250.00 | Below commitment |
| Electrical Project | 5,000,000.00 | 5,000,000.00 | 0.00 | 500,000.00 | 500,000.00 | 0.00 | Meets both commitments |
| HVAC Project | 8,710,000.00 | 8,800,000.00 | 0.00 | 780,000.00 | 780,250.00 | 0.00 | Meets both commitments |
| IFM Civil Maint | 1,500,000.00 | 1,500,000.00 | 0.00 | 259,500.00 | 259,500.00 | 0.00 | Meets both commitments |
| IFM Cleaning Services | 2,300,000.00 | 0.00 | 2,300,000.00 | 372,600.00 | 0.00 | 372,600.00 | No sales targets entered |
| IFM HVAC Maint | 750,000.00 | 0.00 | 750,000.00 | 137,250.00 | 0.00 | 137,250.00 | No sales targets entered |
| Interiors Project | 6,000,000.00 | 10,200,003.00 | 0.00 | 750,000.00 | 1,240,000.00 | 0.00 | Meets both commitments |
| Landscape Maint | 500,000.00 | 0.00 | 500,000.00 | 125,000.00 | 0.00 | 125,000.00 | No sales targets entered |
| Landscape Project | 1,300,000.00 | 0.00 | 1,300,000.00 | 150,000.00 | 0.00 | 150,000.00 | No sales targets entered |
| Machine Leasing | 465,992.00 | 465,992.00 | 0.00 | 111,838.00 | 93,198.40 | 18,639.60 | Below commitment |
| Plumbing & Fire Fighting Project | 3,500,000.00 | 0.00 | 3,500,000.00 | 390,000.00 | 0.00 | 390,000.00 | No sales targets entered |
| Scaffolding | 770,000.00 | 770,000.00 | 0.00 | 242,550.00 | 246,400.00 | 0.00 | Meets both commitments |
| Security Project | 4,870,000.00 | 0.00 | 4,870,000.00 | 701,600.00 | 0.00 | 701,600.00 | No sales targets entered |
| Simplex Project | 850,000.00 | 0.00 | 850,000.00 | 75,000.00 | 0.00 | 75,000.00 | No sales targets entered |

## Division-name mismatches

- Direct Sales: annual commitment is 4,000,000 booking and 425,000 GP. No exact-name target exists. Direct Sales - ACG has 4,000,002 booking and 439,500.24 GP, which would meet both if this is the intended mapping. Direct Sales - AAC and Direct Sales - CamAir also exist; no mapping was assumed.
- Almoayyed Watersolution: annual commitment is 100,000 booking and 46,800 GP. Master division is named Almoayyed Water Solutions, with no entered target under either name. Confirm the naming before classifying.

## Entered targets without an exact-name annual commitment

| Division | Entered booking target | Entered GP target |
|---|---:|---:|
| Direct Sales - AAC | 1,250,000.00 | 163,500.00 |
| Direct Sales - ACG | 4,000,002.00 | 439,500.24 |
| Direct Sales - CamAir | 500,000.00 | 50,000.00 |
| IBMS Maint | 400,000.00 | 100,000.00 |
| IBMS Project | 500,002.00 | 100,000.20 |

Sources: SalesTargets (FinancialYear=2026), commit_Target (Year=2026), Master_EnquiryFor. Comparison uses stored GP value even where stored GP% is zero or rounded.