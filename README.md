# Node-TS-Starter
This is a starter template to reduce boiler plate setup to get a node.js typescript project up and running. 

# What does it contain
- Eslint 
- Renovate
- typescript
- Mocha and Chai
- Jenkinsfile (configured for K8S agent)
- .gitignore, .eslintrc.js, .npmignore
- Setup to get code coverage results and submit them to sonarqube

## Jenkinsfile
This template is coming from a Jenkins/Blue Ocean setup using the K8S agent, github actions may be added as well later.
The Jenkinsfile will do the following, on any push it will execute typical linting, tests, doc generation tests and a sonar qube scan. If the quality gates on the sonar qube scan fail, the build fails.

On push to development, it does all the regular tests but will also bump the pre release version and push to NPM as an alpha.

On push to master, it will bump the minor version and publish to NPM.

All build events will be sent to mattermost.

## Expected secrets
You will need to create secrets for sonar qube, and npm. Git credentials are pulled from Jenkins. Refere to ci-pod-template.yaml for details on names and expected values.

## Helpful links
- [Renovate](https://docs.renovatebot.com/helm-charts)
- [Jenkins](https://charts.jenkins.io)
- [Harbor](https://github.com/goharbor/harbor-helm)
- [Gitea](https://gitea.com/gitea/helm-chart/)
- [Mattermost](https://helm.mattermost.com)
- [Sonarqube](https://github.com/Oteemo/charts/tree/master/charts/sonarqube)
