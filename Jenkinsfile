pipeline {
  agent {
    kubernetes {
      // pod definition that contains env vars, secrets, containers etc needed for building and deploying
      yamlFile 'ci-pod-template.yaml'
    }
  }
  environment {
    AUTHOR_NAME = sh(returnStdout: true, script: "git log -n 1 --pretty=format:'%an'").trim()
  }
  stages {
    stage('Notify') {
      steps {
        mattermostSend color: "warning", message: "[NODE-TS-Starter] Build Started - ${env.JOB_NAME} ${env.BUILD_NUMBER} (<${env.BUILD_URL}|Open>)"
      }
    }
    //always run
    stage('Build') {
        steps {
            container('node-build') {
                // install dependencies
                sh 'npm ci'
                // compile typescript to js and create map files
                sh 'npm run build'
                sh 'npm test'              
                // lint
                sh 'npm run lint'
                // check for vulnerabilities
                sh 'npm audit --production'
                sh 'npm run sonarscan'
                sh 'npm run doc'
            }
        }
    }
    stage('Publish Prerelease') {
        when {
            allOf {
                branch 'development'
                not {
                    expression { env.AUTHOR_NAME.contains('Jenkins') }
                }
            }
        }
        steps {
            container('node-build') {
                sh 'git config user.email "jenkins@nodestarter.not-valid.com"'
                sh 'git config user.name "Jenkins"'
                sh 'npm version prerelease --preid=alpha'
                sh 'git config credential.helper "/bin/bash ' + env.WORKSPACE + '/scripts/git-cred-helper.sh"'
                withCredentials([usernamePassword(credentialsId: '<replace with your git creds ref>',
                                 usernameVariable: 'GIT_USERNAME',
                                 passwordVariable: 'GIT_PASSWORD')]){
                    sh 'git push origin HEAD:development'
                }
                sh 'npm config set //registry.npmjs.org/:_authToken ${NODE_ACCESS_TOKEN}'
                sh 'npm publish --access public'
            }
        }
    }
    stage('Publish') {
        when {
            allOf {
                branch 'main'
                not {
                    expression { env.AUTHOR_NAME.contains('Jenkins') }
                }
            }
        }
        steps {
            container('node-build') {
                sh 'git config --global user.email "jenkins@nodestarter.not-valid.com"'
                sh 'git config --global user.name "Jenkins"'
                sh 'npm version minor'
                sh 'git config credential.helper "/bin/bash ' + env.WORKSPACE + '/scripts/git-cred-helper.sh"'
                withCredentials([usernamePassword(credentialsId: '<replace with your git creds ref>',
                                 usernameVariable: 'GIT_USERNAME',
                                 passwordVariable: 'GIT_PASSWORD')]){
                    sh 'git push origin HEAD:main'
                }
                sh 'npm config set //registry.npmjs.org/:_authToken ${NODE_ACCESS_TOKEN}'
                sh 'npm publish -access public'
            }
        }
    }
  }
  post {
    failure {
       mattermostSend color: "danger", message: "[NODE-TS-Starter] Build Failure - ${env.JOB_NAME} ${env.BUILD_NUMBER} (<${env.BUILD_URL}|Open>)"
    }
    success{
       mattermostSend color: "good", message: "[NODE-TS-Starter] Build Success - ${env.JOB_NAME} ${env.BUILD_NUMBER} (<${env.BUILD_URL}|Open>)"
    }
    always {
       archiveArtifacts artifacts: 'build/**/*,coverage/**/*,docs/**/*', fingerprint: true
    }
  }
}