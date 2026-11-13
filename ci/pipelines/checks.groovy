pipeline {
    agent { label 'vpn-agent2' }
    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
    }
    stages {
        stage('Validate and build dashboard UI') {
            steps { sh 'bash ci/run-isolated.sh' }
        }
    }
    post {
        always { junit allowEmptyResults: false, testResults: 'reports/iam.xml' }
    }
}
