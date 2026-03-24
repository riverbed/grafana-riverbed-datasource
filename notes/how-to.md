# How to

## Testing locally (ADVANCED)

### 1. Build and run Grafana locally

You need to have the following tools set up (ref. [plugin-tools](https://grafana.com/developers/plugin-tools/)):

* Bash
* Git
* Go
* Mage
* Node.js
* Docker

- Check prerequisites

```bash
go version && mage --version && node --version && docker --version && git --version
```

- Get the sources

Fetch the latest from the repo

```bash
git clone https://github.com/riverbed/grafana-riverbed-datasource.git --depth 1 
```

- Build and run

```shell
# Go the folder
cd riverbed-datastore-datasource/

# Build the backend
mage -v build:linux 

# Build frontend
# Using Locked deps (ideal):
# npm clean-install && npm run build
# Using Latest (temporary):
npm install && npm run build

# Run in docker
docker compose up 
```

- Open a web-browser and navigate the local grafana instance on http://localhost:3000


### 2. Using the plugin in Grafana

- Go to Connections > Data sources

- Open the "datastore" connection

- Fill the connection details in the **Settings** tab

> [NOTE!]
> To obtain the connection details
> - Open the Riverbed Console (e.g. https://yourenv.cloud.riverbed.com)
> - Go to Wafle menu > IQ Ops > Management > Hamburger menu > API Access
> - Create OAuth Client, use oauth client name `Riverbed Data Store Plugin for Grafana`
> - Grab **Client Id**  and **Client Secret**

- Click "Save Test" and check you get data it is "Success"

- Click on "Explorer data" (top right corner from )

- Configure this query example. This example This test requires to have NPM+ enabled in the Riverbed Platform (Wafle menu > IQ Ops > Management > Hamburger menu > Edges & Datasources > NPM+)

    * Query Type: **NPM+ (RAW) Traffic**
    * Metrics: **Traffic**
    * Group-by: **Application**

- Click on **Run query** and check you get data like in the screenshot below

![alt text](riverbed-datastore-sample-query.png)