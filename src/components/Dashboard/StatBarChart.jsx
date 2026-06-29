import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const StatBarChart = ({ data, color, title, icon }) => {
    return (
        <div className="chart-container">
            <div className="chart-header">
                <div className="chart-title">
                    {icon}
                    <span>{title}</span>
                </div>
            </div>
            <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: '#666', fontSize: 10 }}
                            axisLine={{ stroke: '#e0e0e0' }}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fill: '#666', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', color: '#333' }}
                            itemStyle={{ color: '#333' }}
                        />
                        <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default StatBarChart;
