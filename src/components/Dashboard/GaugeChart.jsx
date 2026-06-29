import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const GaugeChart = ({ value, label, subLabel }) => {
    const data = [
        { name: 'Value', value: value },
        { name: 'Remaining', value: 100 - value },
    ];
    const COLORS = ['#00C49F', '#e0e0e0'];

    return (
        <div className="gauge-item">
            <div style={{ width: '100px', height: '60px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="100%"
                            startAngle={180}
                            endAngle={0}
                            innerRadius={30}
                            outerRadius={45}
                            paddingAngle={0}
                            dataKey="value"
                            stroke="none"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div style={{ color: '#333', fontWeight: 'bold', marginTop: '-10px' }}>{value}%</div>
            <div style={{ color: '#666', fontSize: '0.7rem' }}>{subLabel}</div>
        </div>
    );
};

export default GaugeChart;
