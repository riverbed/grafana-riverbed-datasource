# Riverbed Data Store plugin for Grafana

![Dashboard](https://github.com/riverbed/grafana-riverbed-datasource/raw/main/src/img/riverbed-demo-dashboard.png)

[![Grafana](https://img.shields.io/badge/Grafana-10.0-green)](https://grafana.com/)
[![Grafana](https://img.shields.io/badge/Grafana-11.0-green)](https://grafana.com/)
[![Grafana](https://img.shields.io/badge/Grafana-12.0-green)](https://grafana.com/)

## Overview

In Grafana, you can now access to the Riverbed Platform using the **Riverbed Data Store plugin for Grafana**.

Bring your own Grafana account and your account on the Riverbed Platform enabled with [Riverbed Products] for example:
[AIOps](https://www.riverbed.com/products/aiops/), [Digital Experience](https://www.riverbed.com/products/digital-experience-management/),
[Cloud Observability](https://www.riverbed.com/products/cloud-performance-management/), [Network Observability](https://www.riverbed.com/products/network-performance-management/), [Application Observability](https://www.riverbed.com/products/application-performance-monitoring/) or [Infrastructure Observability](https://www.riverbed.com/products/netim/)

## Requirements

* an account on the Riverbed Platform
* A Grafana account with admin permission, for example on Grafana Cloud.

## Getting Started

1. Open the Riverbed platform

2. Go to **Management** > **API Access** to find the details and create a client credential for Grafana

    * Tenant Id
    * Directory Id
    * Token URI
    * API Scope
    * Client Id
    * Client Secret


3. Open Grafana Account

4. Go to **Home** > **Connections** > **Data sources** and click **+ Add new data source**

5. Find "Riverbed Data Store datasource" and click **Install now**

6. Fill the Authentication details from step 2.

7. Save and test

Congrats! You are now ready to start building a dashboard.

## Documentation

[Learn more](https://github.com/riverbed/grafana-riverbed-datasource)

## Contributing

Feel free to go the [Riverbed Data Store plugin for Grafana](https://github.com/riverbed/grafana-riverbed-datasource) - which is open-source project page - and please let us know if you have any [issue](https://github.com/riverbed/grafana-riverbed-datasource/issues)
