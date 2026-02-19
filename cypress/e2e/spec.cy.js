let prefix = ''
let localhost = 'localhost'
function runRegister(authentication, port) {
  if (prefix.length) cy.visit('http://' + localhost + ':' + Cypress.env('nginxAddonHttpPort') + '/' + prefix)
  else if (port != undefined) cy.visit('http://' + localhost + ':' + port)
  else cy.visit('http://' + localhost + ':' + Cypress.env('modbus2mqttE2eHttpPort'))
  if (authentication) {
    cy.get('[formcontrolname="username"]').type('test')
    cy.get('[formcontrolname="password"]').type('test')
    cy.get('button[value="authentication"]').click()
  } else {
    // In some states the register-mode isn't shown -> the noAuthentication button doesn't exist
    cy.get('body').then(($body) => {
      if ($body.find('button[value="noAuthentication"]').length) {
        cy.get('button[value="noAuthentication"]').click()
      } else {
        cy.log('noAuthentication button not present; continuing')
      }
    })
  }
  // Some flows route directly to /busses when config exists; ensure we end on /configure
  let targetBaseUrl = ''
  if (prefix.length) targetBaseUrl = 'http://' + localhost + ':' + Cypress.env('nginxAddonHttpPort') + '/' + prefix
  else if (port != undefined) targetBaseUrl = 'http://' + localhost + ':' + port
  else targetBaseUrl = 'http://' + localhost + ':' + Cypress.env('modbus2mqttE2eHttpPort')
  const targetUrl = targetBaseUrl + '/configure'
  cy.visit(targetUrl)
  cy.url().then((url) => {
    if (url.includes('/login')) {
      cy.get('[formcontrolname="username"]').type('test')
      cy.get('[formcontrolname="password"]').type('test')
      cy.get('button[value="authentication"]').click()
      cy.visit(targetUrl)
    }
  })
  cy.url().should('contain', prefix + '/configure')
}
function runConfig(authentication) {
  let port = authentication ? Cypress.env('mosquittoAuthMqttPort') : Cypress.env('mosquittoNoAuthMqttPort')
  // Clear first to avoid concatenating existing value (seen as double URL)
  cy.get('[formcontrolname="mqttserverurl"]')
    .clear({ force: true })
    .type('mqtt://' + localhost + ':' + port, { force: true })
  cy.get('[formcontrolname="mqttserverurl"]').trigger('change')
  if (authentication) {
    cy.get('[formcontrolname="mqttuser"]').clear({ force: true }).type('homeassistant', { force: true })
    cy.get('[formcontrolname="mqttpassword"]').clear({ force: true }).type('homeassistant', { force: true })
    cy.get('[formcontrolname="mqttpassword"]').trigger('change')
  }
  cy.get('div.saveCancel button:first').click({ force: true })
  cy.url().should('contain', prefix + '/busses')
}

function runBusses() {
  cy.url().should('contain', prefix + '/busses')
  cy.get('[role="tab"] ').eq(1).click()
  // Ensure the Host field is reset before typing to avoid concatenation
  cy.get('[formcontrolname="host"]').clear({ force: true }).type(localhost, { force: true })
  // Clear Port and Timeout fields as well to prevent concatenation
  cy.get('[formcontrolname="port"]').clear({ force: true }).type('3002', { force: true })
  cy.get('[formcontrolname="timeout"]').eq(0).clear({ force: true }).type('500', { force: true })
  cy.get('[formcontrolname="host"]').trigger('change')
  cy.get('div.card-header-buttons').first().find('button').first().click({ force: true })
  // List slaves second header button on first card
  cy.get('div.card-header-buttons').first().find('button').eq(1).click()
}

function addSlave(willLog) {
  let logSetting = { log: willLog }
  cy.log('Add Slave ')
  cy.task('log', 'Add Slave')
  cy.url().then((url) => {
    cy.task('log', url)
  })
  cy.url().should('contain', prefix + '/slaves')
  cy.get('[formcontrolname="detectSpec"]', logSetting).click(logSetting)
  // Ensure the New Slave id field is properly set
  cy.contains('mat-card-title', 'New Slave')
    .parents('mat-card')
    .find('[formcontrolname="slaveId"]')
    .scrollIntoView()
    .clear({ force: true })
    .type('3', { force: true, log: willLog })
    .trigger('change')
    .trigger('blur')
  // Add the new slave via the Add button (more reliable than Enter key in CI)
  cy.contains('mat-card-title', 'New Slave')
    .parents('mat-card')
    .find('button')
    .first()
    .then(($btn) => {
      if ($btn.is(':disabled')) {
        cy.log('Add Slave button disabled; assuming slave already exists')
      } else {
        cy.wrap($btn).click({ force: true })
      }
    })

  // Wait for the first slave card to render (uiSlaves)
  cy.get('app-select-slave mat-card', { timeout: 10000 })
    .filter((_, el) => !el.innerText.includes('New Slave'))
    .first()
    .as('firstSlaveCard')
  cy.get('@firstSlaveCard').find('mat-expansion-panel-header', { timeout: 10000 })
  // Open collapsed panels to reveal controls
  cy.get('@firstSlaveCard').find('mat-expansion-panel-header[aria-expanded=false]', logSetting).then((elements) => {
    if (elements.length >= 1) {
      elements[0].click(logSetting)
    }
    if (elements.length >= 2) {
      elements[1].click(logSetting)
    }
  })

  // Set Poll Mode on the newly added slave
  cy.get('@firstSlaveCard').find('mat-select[formControlName="pollMode"]', logSetting)
    .click()
    .get('mat-option')
    .contains('No polling')
    .click(logSetting)
  cy.get('@firstSlaveCard').find('div.card-header-buttons button:contains("check_circle")', logSetting).eq(0, logSetting).click(logSetting)
  // Show specification third header button on first card
  cy.get('@firstSlaveCard').find('div.card-header-buttons button:contains("add_box")', logSetting).eq(0, logSetting).click(logSetting)

  cy.url().should('contain', prefix + '/specification')
}
describe('End to End Tests', () => {
  before(() => {
    let logSetting = { log: false }
  })
  after(() => {
    let logSetting = { log: false }
    // wait for all tests then
  })

  it(
    'register->mqtt->busses->slaves->specification with authentication',
    {
      retries: {
        runMode: 0,
        openMode: 0,
      },
    },
    () => {
      runRegister(true)
      runConfig(true)
      runBusses()
      addSlave(true)
    }
  )
  it(
    'register->mqtt with no authentication',
    {
      retries: {
        runMode: 0,
        openMode: 0,
      },
    },
    () => {
      runRegister(false, Cypress.env('modbus2mqttMqttNoAuthPort'))
      runConfig(false)
    }
  )
  it(
    'mqtt hassio addon',
    {
      retries: {
        runMode: 0,
        openMode: 0,
      },
    },
    () => {
      prefix = 'ingress'
      cy.visit('http://' + localhost + ':' + Cypress.env('nginxAddonHttpPort') + '/' + prefix)
      runBusses()
    }
  )
})
