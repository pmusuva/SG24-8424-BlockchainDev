'use strict';
/*
 * Copyright IBM Corp All Rights Reserved
 *
 * SPDX-License-Identifier: Apache-2.0
 */
/*
 * Enroll the admin user
 */

var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');

var path = require('path');
var util = require('util');
var os = require('os');
const environment = process.env.MODE || 'ibp';
var config = require(`./config-${environment}.json`);
const logger = require('log4js').getLogger('enroll-admin.js');
logger.setLevel(process.env.LOGLEVEL || 'info');

var fabric_client = new Fabric_Client();
var fabric_ca_client = null;
var admin_user = null;
var member_user = null;

module.exports = (ca) => {

    return new Promise((resolve, reject) => {

        var store_path = path.join(__dirname, `${config.keyValueStore}/${ca['x-mspid']}`);
        logger.info('Using store path:' + store_path);

        Fabric_Client.newDefaultKeyValueStore({
            path: store_path
        }).then((state_store) => {

            fabric_client.setStateStore(state_store);
            var crypto_suite = Fabric_Client.newCryptoSuite();
            var crypto_store = Fabric_Client.newCryptoKeyStore({
                path: store_path
            });
            crypto_suite.setCryptoKeyStore(crypto_store);
            fabric_client.setCryptoSuite(crypto_suite);
            var tlsOptions = {
                trustedRoots: [],
                verify: false
            };

            fabric_ca_client = new Fabric_CA_Client(ca.url, tlsOptions, ca.caName, crypto_suite);

            return fabric_client.getUserContext(ca.registrar[0].enrollId, true);
        }).then((user_from_store) => {
            if (user_from_store && user_from_store.isEnrolled()) {
                logger.info(`Successfully loaded ${ca.registrar[0].enrollId} from persistence. No need to enroll`);
                admin_user = user_from_store;
                return null;
            } else {
                // need to enroll it with CA server
                return fabric_ca_client.enroll({
                    enrollmentID: ca.registrar[0].enrollId,
                    enrollmentSecret: ca.registrar[0].enrollSecret
                }).then((enrollment) => {
                    logger.info(`Successfully enrolled admin user "${ca.registrar[0].enrollId}"`);
                    return fabric_client.createUser({
                        username: ca.registrar[0].enrollId,
                        mspid: ca['x-mspid'],
                        cryptoContent: {
                            privateKeyPEM: enrollment.key.toBytes(),
                            signedCertPEM: enrollment.certificate
                        }
                    });
                }).then((user) => {
                    admin_user = user;
                    return fabric_client.setUserContext(admin_user);
                }).catch((err) => {
                    logger.error(`Failed to enroll and persist "${ca.registrar[0].enrollId}". Error: ` + err.stack ? err.stack : err);
                    throw new Error(`"${ca.registrar[0].enrollId}"`);
                });
            }
        }).then(() => {
            const message = `Assigned the admin user to the fabric client: ${admin_user.toString()}`;
            logger.info(message);
            resolve({
                success: true,
                message: message
            });
        }).catch((err) => {
            const message = `Failed to enroll admin: ' + ${err}`;
            logger.error(message);
            reject({
                success: false,
                message: message
            });
        });
    });
};