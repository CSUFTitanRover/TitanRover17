import React, { Component } from 'react';
import BaseModuleTemplate from '../../../templates/BaseModuleTemplate';
import LiveDataTemplate from '../../../templates/LiveDataTemplate';

const initialCols = [
    ['data1'],
    ['data2']
];

class Chart1 extends Component {

    render() {
        return (
            <BaseModuleTemplate moduleName="Chart #1">
                <LiveDataTemplate
                    chartId="chart1"
                    chartInitialColumns={initialCols}
                    chartType="line"
                />
            </BaseModuleTemplate>
        );
    }
}

export default Chart1;

/*
 * On the fly Documentation so I dont forget whats going on

     Additional Chart Props for more customization.

     const chartProps = {
     data: {
         columns: columns,
         types: {
         data1: 'area',
         data2: 'area-spline'
         }
     },
     zoom: {
        enabled: true
     }
     ...
     };

    This would be defined in Chart1.js and passed as a prop
    like:

    <LiveDataTemplate
    ...
    chartProps={chartProps}
    />

 */