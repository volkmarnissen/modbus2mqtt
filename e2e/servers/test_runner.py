from command_utils import executeCommandWithOutputs
import sys

def testRepository(reponame:str):
    args = ["npm", 'run', 'test' ]
    print("::group::Unit tests for " + reponame)
    executeCommandWithOutputs(args,sys.stderr, sys.stderr)
    print( '::endgroup::' )

def testall(package:str)->bool:
    testRepository(package)
    import os
    if os.path.isdir("e2e"):
        print("::group::Playwright E2E tests")
        executeCommandWithOutputs(["npx", "playwright", "test"],sys.stderr, sys.stdout)
        print( '::endgroup::' )
    else:
        print("No e2e tests found in " + os.getcwd(), file=sys.stderr)
